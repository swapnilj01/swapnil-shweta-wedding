#!/usr/bin/env node
/**
 * Generates assets/wedding.ics from config.json.
 *
 *   npm run calendar
 *
 * One VEVENT per schedule entry, so "Add all events to calendar" gives guests
 * the whole running order rather than a single lump. Because it reads the same
 * config.json the page does, the bride and groom repos each produce their own
 * correct calendar from identical code.
 *
 * Re-run this whenever you edit config.json's schedule.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config.json');
const OUT = path.join(ROOT, 'assets', 'wedding.ics');

/** Default length of an event when we can't infer one from the next entry. */
const DEFAULT_MINUTES = 90;
const MAX_MINUTES = 6 * 60;

/** iCalendar reserves , ; and \ inside text values, and \n means a line break. */
const esc = s => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/** "2026-12-23T07:00:00+05:30" -> "20261223T070000" (paired with TZID). */
function localStamp(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}${mo}${d}T${h}${mi}${s || '00'}`;
}

/**
 * Add minutes to a wall-clock time and re-emit it in the same local form.
 *
 * Deliberately does the arithmetic through Date.UTC and reads UTC fields back:
 * that gives correct calendar rollover (23:00 + 90min -> next day 00:30)
 * without ever converting between timezones. Pairing a UTC-converted value with
 * TZID=Asia/Kolkata would silently shift every end time by 5.5 hours.
 */
function addLocalMinutes(iso, minutes) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const t = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0)) + minutes * 60000;
  const dt = new Date(t);
  const p = n => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`
       + `T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}`;
}

/** RFC 5545 caps lines at 75 octets; continuations start with a single space. */
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  while (start < bytes.length) {
    const limit = out.length === 0 ? 75 : 74;
    let end = Math.min(start + limit, bytes.length);
    // Don't split a multi-byte character across the fold.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    out.push((out.length ? ' ' : '') + bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  return out.join('\r\n');
}

async function main() {
  let cfg;
  try {
    cfg = JSON.parse(await readFile(CONFIG, 'utf8'));
  } catch (err) {
    console.error(`Could not read config.json: ${err.message}`);
    process.exit(1);
  }

  const schedule = (Array.isArray(cfg.schedule) ? cfg.schedule : [])
    .filter(item => item && item.title && localStamp(item.iso));
  if (!schedule.length) {
    console.error('config.json has no schedule entries with a valid `iso` and `title`.');
    process.exit(1);
  }

  const side = cfg.side === 'groom' ? 'groom' : 'bride';
  const top = cfg?.couple?.top?.name || 'Shweta';
  const bottom = cfg?.couple?.bottom?.name || 'Swapnil';
  const venueByName = new Map(
    (Array.isArray(cfg.venues) ? cfg.venues : []).map(v => [v.name, v])
  );
  // Fixed stamp: a changing DTSTAMP would make every rebuild look like an edit.
  const dtstamp = '20260715T000000Z';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Shweta Swapnil Wedding//Wedding Invite//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(`${top} weds ${bottom}`)}`,
  ];

  schedule.forEach((item, i) => {
    const next = schedule[i + 1];
    let minutes = DEFAULT_MINUTES;
    if (next) {
      const gap = (new Date(next.iso) - new Date(item.iso)) / 60000;
      if (gap > 0) minutes = Math.min(gap, MAX_MINUTES);
    }

    const venue = venueByName.get(item.venueName);
    const location = [item.venueName, venue?.address].filter(Boolean).join(', ');
    const description = [
      venue?.note ? venue.note : '',
      item.mapsUrl ? `Map: ${item.mapsUrl}` : '',
      cfg?.rsvp?.contactName && cfg?.rsvp?.phone
        ? `RSVP: ${cfg.rsvp.contactName} (${cfg.rsvp.contactRelation || ''}) ${cfg.rsvp.phone}`.replace(/\(\)\s*/, '')
        : '',
    ].filter(Boolean).join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${side}-${localStamp(item.iso)}-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}@shweta-swapnil-wedding`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=Asia/Kolkata:${localStamp(item.iso)}`,
      `DTEND;TZID=Asia/Kolkata:${addLocalMinutes(item.iso, minutes) || localStamp(item.iso)}`,
      `SUMMARY:${esc(`${item.title} — ${top} weds ${bottom}`)}`,
      ...(location ? [`LOCATION:${esc(location)}`] : []),
      ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');

  // CRLF line endings are required by RFC 5545, and some clients enforce it.
  const ics = lines.map(fold).join('\r\n') + '\r\n';
  await writeFile(OUT, ics, 'utf8');

  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
  console.log(`  ${schedule.length} events (${side} side)`);
  for (const item of schedule) console.log(`    ${item.date || ''} ${item.time || ''}  ${item.title}`);
  console.log('');
}

main().catch(err => {
  console.error(`Calendar build failed: ${err.message}`);
  process.exit(1);
});
