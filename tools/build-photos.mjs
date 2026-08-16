#!/usr/bin/env node
/**
 * Turns phone photos into fast, mobile-friendly WebP for the invite gallery.
 *
 *   1. Drop photos into  photos/originals/   (JPG, PNG, HEIC, HEIF, TIFF, WebP)
 *   2. Run                npm run photos
 *   3. Write captions in  photos/photos.json
 *
 * No npm dependencies. It shells out to `sips` and `cwebp`, both of which are
 * already on this Mac (`cwebp` came with Homebrew's `webp`; `sips` ships with macOS).
 *
 * Safe to re-run as often as you like:
 *   - a caption you have written is NEVER overwritten
 *   - unchanged photos are skipped, so re-runs are fast
 *   - photos.json.bak is written before every rewrite
 *   - EXIF metadata (including GPS coordinates) is stripped from every output
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, open, readdir, readFile, writeFile, stat, copyFile, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Which folder holds this side's photos. Read from config.json's
 * gallery.photosDir so the bride and groom repos can each point at their own
 * folder while running identical code. Defaults to "photos".
 */
function readPhotosDir() {
  try {
    const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    const dir = cfg?.gallery?.photosDir;
    if (typeof dir === 'string' && dir.trim()) {
      // Keep it inside the project; a stray "../" would write outside the repo.
      const resolved = path.resolve(ROOT, dir.trim());
      if (resolved.startsWith(ROOT + path.sep)) return resolved;
      console.warn(`  ! gallery.photosDir "${dir}" is outside the project; using "photos" instead.`);
    }
  } catch { /* no config, or unreadable — fall through to the default */ }
  return path.join(ROOT, 'photos');
}

const PHOTOS_DIR = readPhotosDir();
const ORIGINALS  = path.join(PHOTOS_DIR, 'originals');
const OPTIMIZED  = path.join(PHOTOS_DIR, 'optimized');
const JSON_PATH  = path.join(PHOTOS_DIR, 'photos.json');
/** Web path prefix written into photos.json, e.g. "photos/optimized/x.webp". */
const WEB_PREFIX = path.relative(ROOT, OPTIMIZED).split(path.sep).join('/');

/** Widths we emit. The browser picks one via srcset; phones normally take 640 or 1024. */
const WIDTHS = [640, 1024, 1600];
/** Width of the inlined blur-up placeholder. Tiny on purpose — this becomes a data URI. */
const LQIP_WIDTH = 24;
const QUALITY = 80;
const LQIP_QUALITY = 40;

const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.tif', '.tiff', '.webp']);
/** cwebp cannot decode these, so sips transcodes them to a temp JPEG first. */
const NEEDS_TRANSCODE = new Set(['.heic', '.heif', '.tif', '.tiff']);
const JPEG_EXT = new Set(['.jpg', '.jpeg']);

/**
 * Bumped whenever a change here would produce different pixels from the same
 * source. Stored in photos.json; a mismatch forces a full re-encode instead of
 * leaving stale output behind because the mtimes still look fresh.
 *   2 — apply EXIF orientation (v1 silently produced sideways photos)
 */
const PIPELINE_VERSION = 2;

/**
 * sips arguments that rotate/flip a stored image upright, per EXIF orientation.
 * Cameras record orientation as a flag rather than rotating pixels, and cwebp
 * neither reads that flag nor (with -metadata none) passes it on — so unless we
 * bake the rotation in here, a portrait photo ships sideways.
 * Operations apply in the order given.
 */
const ORIENT_FIX = {
  1: [],                                   // already upright
  2: ['-f', 'horizontal'],                 // mirrored
  3: ['-r', '180'],
  4: ['-f', 'vertical'],
  5: ['-r', '90', '-f', 'horizontal'],     // transpose
  6: ['-r', '90'],                         // portrait, camera turned clockwise
  7: ['-r', '270', '-f', 'horizontal'],    // transverse
  8: ['-r', '270'],                        // portrait, camera turned anticlockwise
};

const DEFAULT_HEADING = 'If you missed the events so far, here are some snaps to glance over';

const c = {
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  amber: s => `\x1b[33m${s}\x1b[0m`,
  red:   s => `\x1b[31m${s}\x1b[0m`,
};

const warnings = [];
const warn = msg => { warnings.push(msg); console.warn(`  ${c.amber('!')} ${msg}`); };

/** `sips -g` prints "  key: value" lines. Pull the ones we asked for. */
async function sipsProps(file, keys) {
  const args = keys.flatMap(k => ['-g', k]);
  const { stdout } = await run('sips', [...args, file]);
  const out = {};
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s{2}(\w+):\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/**
 * Read the EXIF orientation tag out of a JPEG, returning 1..8 (1 = upright).
 *
 * Only the header is read, not the whole 20 MB file. `sips -g orientation`
 * reports <nil> for these camera files, so we parse the tag ourselves.
 */
async function exifOrientation(file) {
  let handle;
  try {
    handle = await open(file, 'r');
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(256 * 1024), 0, 256 * 1024, 0);
    const buf = buffer.subarray(0, bytesRead);
    if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return 1;   // not a JPEG

    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xFF) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xFF) { i += 1; continue; }                          // padding
      if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD9)) { i += 2; continue; }
      if (marker === 0xDA) break;                                         // image data starts
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;

      if (marker === 0xE1 && buf.subarray(i + 4, i + 10).toString('latin1') === 'Exif\0\0') {
        const tiff = i + 10;
        if (tiff + 8 > buf.length) return 1;
        const le = buf.subarray(tiff, tiff + 2).toString('latin1') === 'II';
        const u16 = o => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = o => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const ifd = tiff + u32(tiff + 4);
        if (ifd + 2 > buf.length) return 1;
        const count = u16(ifd);
        for (let k = 0; k < count; k += 1) {
          const entry = ifd + 2 + k * 12;
          if (entry + 12 > buf.length) break;
          if (u16(entry) === 0x0112) {                                    // Orientation
            const value = u16(entry + 8);
            return value >= 1 && value <= 8 ? value : 1;
          }
        }
        return 1;
      }
      i += 2 + len;
    }
    return 1;
  } catch {
    return 1;      // unreadable EXIF is not a reason to skip the photo
  } finally {
    await handle?.close();
  }
}

async function getDims(file) {
  const p = await sipsProps(file, ['pixelWidth', 'pixelHeight']);
  const width = Number(p.pixelWidth);
  const height = Number(p.pixelHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error(`could not read dimensions (sips reported width=${p.pixelWidth} height=${p.pixelHeight})`);
  }
  return { width, height };
}

/**
 * Filenames become both the slug and the stable JSON id, so captions survive
 * re-runs. Keep them meaningful: `haldi-morning-01.jpg` reads better than `IMG_4821.HEIC`.
 */
function slugify(basename) {
  const slug = basename
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return slug || 'photo';
}

/** Widths worth emitting for a given source. Never upscales. */
function targetWidths(sourceWidth) {
  const fitting = WIDTHS.filter(w => w <= sourceWidth);
  if (fitting.length === 0) return [sourceWidth];            // very small source: one native-size variant
  const largest = fitting[fitting.length - 1];
  // e.g. a 1300px source gets 640 / 1024 / 1300 rather than throwing away 276px of detail.
  if (sourceWidth > largest && sourceWidth < WIDTHS[WIDTHS.length - 1]) fitting.push(sourceWidth);
  return [...new Set(fitting)].sort((a, b) => a - b);
}

async function encode(source, outFile, width, quality) {
  await run('cwebp', [
    '-quiet',
    '-q', String(quality),
    '-resize', String(width), '0',   // 0 height = preserve aspect ratio
    '-metadata', 'none',             // strips EXIF, including GPS location
    '-m', '6', '-mt',
    source, '-o', outFile,
  ]);
}

async function mtimeMs(file) {
  try { return (await stat(file)).mtimeMs; } catch { return -Infinity; }
}

async function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  const raw = await readFile(file, 'utf8');
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Never silently discard hand-written captions because of a stray comma.
    const rescue = `${file}.broken-${Date.now()}`;
    await copyFile(file, rescue);
    warn(`photos.json is not valid JSON (${err.message}). Your copy is safe at ` +
         `${path.relative(ROOT, rescue)} — fix the syntax there and merge it back. Starting fresh for now.`);
    return null;
  }
}

/** A caption is "yours" if you typed something into it. Blank strings are ours to fill. */
const authored = v => typeof v === 'string' && v.trim() !== '';

async function main() {
  await mkdir(ORIGINALS, { recursive: true });
  await mkdir(OPTIMIZED, { recursive: true });

  let entries;
  try {
    entries = await readdir(ORIGINALS, { withFileTypes: true });
  } catch (err) {
    console.error(c.red(`Could not read ${path.relative(ROOT, ORIGINALS)}: ${err.message}`));
    process.exit(1);
  }

  const sources = entries
    .filter(e => e.isFile() && !e.name.startsWith('.'))
    .filter(e => SOURCE_EXT.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  const ignored = entries
    .filter(e => e.isFile() && !e.name.startsWith('.') && !SOURCE_EXT.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name);

  console.log(`\n${c.bold('Building gallery photos')}`);
  const fromRel = path.relative(ROOT, ORIGINALS).split(path.sep).join('/');
  console.log(c.dim(`  from  ${fromRel}/  (${sources.length} photo${sources.length === 1 ? '' : 's'})`));
  console.log(c.dim(`  into  ${WEB_PREFIX}/  at ${WIDTHS.join(' / ')}px WebP\n`));

  if (ignored.length) {
    warn(`Skipped ${ignored.length} unsupported file(s): ${ignored.slice(0, 5).join(', ')}` +
         `${ignored.length > 5 ? ', …' : ''}. Supported: ${[...SOURCE_EXT].join(' ')}`);
  }

  // Read this up front: the encoder needs to know whether existing output was
  // produced by an older pipeline and must therefore be regenerated.
  const existing = await readJsonIfPresent(JSON_PATH);
  const staleVersion = Number(existing?._pipelineVersion || 0) < PIPELINE_VERSION
    && Array.isArray(existing?.photos) && existing.photos.length > 0;
  if (staleVersion) {
    console.log(`  ${c.amber('!')} Output was built by an older version of this script ` +
      `(v${existing?._pipelineVersion || 1} -> v${PIPELINE_VERSION}); re-encoding everything.\n`);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'wedding-photos-'));
  const built = [];
  const claimed = new Map();   // slug -> first filename that took it
  let encoded = 0, skipped = 0, failed = 0;

  for (const name of sources) {
    const sourcePath = path.join(ORIGINALS, name);
    const ext = path.extname(name).toLowerCase();
    const base = path.basename(name, path.extname(name));

    // Two different originals must not collide onto one slug and silently overwrite.
    // e.g. "Haldi 01.jpg" and "haldi-01.HEIC" both slugify to "haldi-01".
    let id = slugify(base);
    if (claimed.has(id)) {
      const original = id;
      let n = 2;
      while (claimed.has(`${original}-${n}`)) n += 1;
      id = `${original}-${n}`;
      warn(`"${name}" slugifies to the same name as "${claimed.get(original)}"; using "${id}" instead.`);
    }
    claimed.set(id, name);

    try {
      const sourceMtime = await mtimeMs(sourcePath);
      const lqipFile = path.join(OPTIMIZED, `${id}-lqip.webp`);

      // Normalise to a plain, upright JPEG when either cwebp can't read the
      // format or the camera recorded a rotation. We then measure THIS file, so
      // the width/height we record always match the pixels in the WebP.
      const orientation = JPEG_EXT.has(ext) ? await exifOrientation(sourcePath) : 1;
      const needsRotate = orientation !== 1;
      let decodeFrom = sourcePath;

      if (NEEDS_TRANSCODE.has(ext) || needsRotate) {
        decodeFrom = path.join(tmpDir, `${id}.jpg`);
        await run('sips', [
          '-s', 'format', 'jpeg', '-s', 'formatOptions', '95',
          ...(ORIENT_FIX[orientation] ?? []),
          sourcePath, '--out', decodeFrom,
        ]);
      }

      const { width: srcW, height: srcH } = await getDims(decodeFrom);
      const widths = targetWidths(srcW);
      const variants = widths.map(w => ({
        width: w,
        height: Math.max(1, Math.round((srcH * w) / srcW)),
        file: path.join(OPTIMIZED, `${id}-${w}.webp`),
        rel: `${WEB_PREFIX}/${id}-${w}.webp`,
      }));

      const outputs = [...variants.map(v => v.file), lqipFile];
      const oldest = Math.min(...(await Promise.all(outputs.map(mtimeMs))));
      const fresh = !staleVersion && oldest >= sourceMtime && outputs.every(f => existsSync(f));

      if (fresh) {
        skipped += 1;
        console.log(`  ${c.dim('=')} ${name} ${c.dim('unchanged')}`);
      } else {
        for (const v of variants) await encode(decodeFrom, v.file, v.width, QUALITY);
        await encode(decodeFrom, lqipFile, LQIP_WIDTH, LQIP_QUALITY);
        encoded += 1;
        const bytes = (await Promise.all(variants.map(async v => (await stat(v.file)).size)));
        const rotated = needsRotate ? c.amber(` rotated (EXIF ${orientation})`) : '';
        console.log(`  ${c.green('+')} ${name} ${c.dim(`-> ${widths.join('/')}px  ` +
          `(${bytes.map(b => `${Math.round(b / 1024)}kB`).join(' ')})`)}${rotated}`);
      }

      // Largest variant is the lightbox source; 1024 (or the biggest below it) is the card default.
      const largest = variants[variants.length - 1];
      const cardDefault = variants.find(v => v.width >= 1024) ?? largest;
      const lqip = `data:image/webp;base64,${(await readFile(lqipFile)).toString('base64')}`;

      built.push({
        id,
        source: name,
        src: cardDefault.rel,
        srcset: variants.map(v => `${v.rel} ${v.width}w`).join(', '),
        full: largest.rel,
        width: largest.width,
        height: largest.height,
        lqip,
      });
    } catch (err) {
      failed += 1;
      console.log(`  ${c.red('x')} ${name} ${c.dim('failed')}`);
      warn(`"${name}" could not be processed: ${err.message.split('\n')[0]}`);
    }
  }

  await rm(tmpDir, { recursive: true, force: true });

  // ---- merge into photos.json, preserving everything the couple has written ----
  const previous = Array.isArray(existing?.photos) ? existing.photos : [];
  const byId = new Map(previous.filter(p => p && p.id).map(p => [p.id, p]));
  const builtById = new Map(built.map(b => [b.id, b]));

  const merged = [];
  let kept = 0, added = 0, missing = 0;

  // Existing order wins, so the couple controls the narrative sequence.
  for (const old of previous) {
    if (!old?.id) continue;
    const fresh = builtById.get(old.id);
    if (fresh) {
      merged.push({
        id: fresh.id,
        caption: authored(old.caption) ? old.caption : '',
        event: authored(old.event) ? old.event : '',
        alt: authored(old.alt) ? old.alt : '',
        src: fresh.src, srcset: fresh.srcset, full: fresh.full,
        width: fresh.width, height: fresh.height, lqip: fresh.lqip,
      });
      if (authored(old.caption)) kept += 1;
      builtById.delete(old.id);
    } else {
      // Original is gone. Flag it rather than dropping a caption the couple wrote.
      merged.push({ ...old, missing: true });
      missing += 1;
    }
  }

  for (const fresh of builtById.values()) {
    merged.push({
      id: fresh.id,
      caption: '', event: '', alt: '',
      src: fresh.src, srcset: fresh.srcset, full: fresh.full,
      width: fresh.width, height: fresh.height, lqip: fresh.lqip,
    });
    added += 1;
  }

  if (existsSync(JSON_PATH)) await copyFile(JSON_PATH, `${JSON_PATH}.bak`);

  const payload = {
    _comment: 'Edit "caption", "event" and "alt". Everything else is regenerated by `npm run photos` ' +
              'and will be overwritten. Reorder the array to reorder the gallery.',
    _pipelineVersion: PIPELINE_VERSION,
    heading: authored(existing?.heading) ? existing.heading : DEFAULT_HEADING,
    photos: merged,
  };
  await writeFile(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  // ---- report ----
  const needCaption = merged.filter(p => !p.missing && !authored(p.caption));
  console.log(`\n${c.bold('Done.')} ${encoded} encoded, ${skipped} unchanged` +
    `${failed ? `, ${c.red(`${failed} failed`)}` : ''}.`);
  console.log(`  ${merged.filter(p => !p.missing).length} photo(s) in the gallery` +
    `${added ? `, ${added} new` : ''}${kept ? `, ${kept} caption(s) preserved` : ''}.`);

  if (missing) {
    console.log(`\n  ${c.amber(`${missing} entr${missing === 1 ? 'y' : 'ies'} marked "missing": true`)} ` +
      `— the original is no longer in photos/originals/.\n  ` +
      c.dim('The gallery skips these. Delete them from photos.json, or put the photo back.'));
  }
  if (needCaption.length) {
    console.log(`\n  ${c.bold('Next:')} write captions in ${c.bold('photos/photos.json')} for:`);
    for (const p of needCaption.slice(0, 12)) console.log(`    ${c.dim('·')} ${p.id}`);
    if (needCaption.length > 12) console.log(c.dim(`    … and ${needCaption.length - 12} more`));
  }
  if (!merged.some(p => !p.missing)) {
    console.log(`\n  ${c.dim('No photos yet. Drop some into photos/originals/ and run this again.')}`);
    console.log(`  ${c.dim('The gallery section hides itself automatically while it is empty.')}`);
  }
  console.log('');

  if (failed) process.exitCode = 1;
}

main().catch(err => {
  console.error(`\n${c.red('Build failed:')} ${err.message}`);
  if (err.message.includes('ENOENT') || /cwebp|sips/.test(err.message)) {
    console.error(c.dim('\n  This script needs `cwebp` and `sips`.\n' +
      '  sips ships with macOS. Install cwebp with:  brew install webp\n'));
  }
  process.exit(1);
});
