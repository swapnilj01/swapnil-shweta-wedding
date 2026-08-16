# Swapnil weds Shweta — wedding invitation

A mobile-first, GitHub Pages-ready wedding invitation. Celebrations run **22–25 December 2026**
across three venues, with the wedding at **11 PM on 23 December** at Greenland Resort,
Patia, Bhubaneshwar.

This is the **groom-side** site. The bride-side one lives at
[`swapnilj01/shweta-swapnil-wedding`](https://github.com/swapnilj01/shweta-swapnil-wedding) and
shares this codebase, swapping `config.json` and the `<head>` meta tags.

- Scroll-driven gate-opening intro, floating petals, diyas, jasmine garlands and florals
- Countdown to the muhurta
- Horizontally scrollable photo gallery with captions, and a tap-to-zoom viewer
- Multi-day running order, per-venue maps, calendar download, RSVP by SMS or call
- Instrumental background music
- Works fully offline of any CDN — every library is vendored in `vendor/`

---

## Adding a photo — the thing you'll do most

### The three steps

```sh
# 1. Copy the photo into the originals folder. Straight off the camera or phone
#    is fine — JPG, PNG, HEIC, HEIF, TIFF and WebP all work. Do NOT resize,
#    convert or rotate it first; the script does all of that.
cp ~/Desktop/haldi-morning-01.jpg photos/originals/

# 2. Convert and optimise. Takes a second or two per photo.
npm run photos

# 3. Open photos/photos.json and write the caption for the new entry,
#    then commit and push.
```

**Name the file before you copy it in.** The filename becomes the caption key, so
`haldi-morning-01.jpg` gives you `haldi-morning-01` in the JSON — far easier to find than
`IMG_4821`. Use lowercase, dashes instead of spaces.

### What "optimise" actually does

Each original becomes **WebP**, the format the site serves. WebP is roughly 30% smaller than JPEG
at the same quality and every current browser supports it. For each photo the script writes:

| Output | Purpose |
|---|---|
| `<name>-640.webp` | phones |
| `<name>-1024.webp` | large phones and tablets |
| `<name>-1600.webp` | desktop, and the full-screen viewer |
| `<name>-lqip.webp` | 24px blur placeholder, inlined into the JSON as a data URI |

The browser picks whichever size fits the screen via `srcset`, so a phone never downloads the
1600px file. Your 11 photos went from **166 MB of originals to 3.9 MB of WebP** this way.

It also:
- **rotates photos upright** — cameras store rotation as an EXIF flag rather than rotating pixels,
  and WebP encoders drop that flag, so without this a portrait shot ships sideways;
- **strips all EXIF metadata**, including the GPS coordinates phones bake in.

### Which folder?

`gallery.photosDir` in `config.json` (default `photos`). The bride and groom repos can point at
different folders while running identical code. Whatever you set, the script expects
`<photosDir>/originals/` and writes `<photosDir>/optimized/` and `<photosDir>/photos.json`.

### Removing or reordering

Reorder the `photos` array in `photos.json` — that's the order guests see. To remove a photo,
delete it from `originals/` and re-run; the entry is marked `"missing": true` rather than deleted,
so a caption you wrote is never silently lost.

### Requirements, and what to do on Windows/Linux

Needs `cwebp` and macOS's built-in `sips`:

```sh
brew install webp
```

This script is macOS-only because of `sips`. Elsewhere, convert manually and skip step 2:

1. Convert to WebP with [Squoosh](https://squoosh.app) (drag in, pick WebP, quality ~80, resize
   the longest edge to 1600px).
2. Save as `photos/optimized/<name>-1600.webp`.
3. Add an entry to `photos.json` by hand, copying the shape of an existing one. `srcset` and
   `lqip` are optional — with a single size, set `src`, `full`, `width` and `height` and leave
   `srcset` as just that one file.

Full detail, including the merge guarantees that stop a re-run overwriting your captions, is in
**[`photos/README.md`](photos/README.md)**.

The gallery section **hides itself while there are no photos**, so nothing looks broken to guests
while you're still adding them.

---

## Two repos, one codebase

The bride-side and groom-side sites run **identical** `index.html`, `styles.css` and `script.js`.
Only two things differ:

| | |
|---|---|
| `config.json` | names, parents, schedule, venues, RSVP wording + number, best-compliments list, which photo folder to use |
| the photo folder | the pictures for that side (named by `gallery.photosDir`) |

This repo holds the **groom-side** config. Its schedule spans 22–25 December and lists three
venues; the bride-side repo has its own six-event running order and a single venue.

Every value in `config.json` also exists as hardcoded fallback text in `index.html`, so if the
file fails to load the page still reads correctly — it just shows this side's defaults.

**Conventions worth knowing:**
- With exactly one venue, its name becomes the section heading and is omitted from the card, so
  it isn't printed twice.
- `bestCompliments.names` currently holds placeholders (`Name 1`…). **Replace them** — if the list
  is empty the whole section removes itself.
- Schedule entries are grouped by their `date` field, so a multi-day running order renders with
  one heading per day.
- The whole RSVP block is config-driven — `heading`, `message`, `buttonLabel`, `callLabel`,
  `contactName`, `contactRelation`, `phone` and an optional `smsBody` to prefill the message.
  Remove `phone` and the RSVP buttons remove themselves rather than linking nowhere.
- `gallery.photosDir` picks the photo folder, so the two sides never share pictures.

After editing the schedule in `config.json`, run:

```sh
npm run calendar     # regenerates assets/*.ics — one VEVENT per event
```

## Before you publish — one required edit

Link previews on WhatsApp, iMessage and Facebook **ignore relative image paths**. So the two
absolute URLs near the top of `index.html` must point at your real address:

```html
<link rel="canonical" href="https://<username>.github.io/shweta-swapnil-wedding/" />
<meta property="og:url"   content="https://<username>.github.io/shweta-swapnil-wedding/" />
<meta property="og:image" content="https://<username>.github.io/shweta-swapnil-wedding/assets/og-cover.jpg" />
```

They're marked with a `SITE_URL` comment block so they're easy to find. This repo is already set
to `swapnilj01.github.io/swapnil-shweta-wedding`, and the `<title>`/`og:title` already read
"Swapnil weds Shweta".

Test the result at [WhatsApp's link preview debugger](https://developers.facebook.com/tools/debug/)
once the site is live.

## What is and isn't in this repo

**Your full-resolution originals are deliberately not committed.** `photos/originals/` is
gitignored, because those files are ~15 MB each straight off the camera (7008×4672) and git keeps
every version forever — committing them would bloat the repo past 150 MB with no way to shrink it
back. The site doesn't need them; it serves `photos/optimized/` (~4 MB), which *is* committed.

So keep `photos/originals/` backed up somewhere of your own (Google Photos, an external drive).
You only need it locally to re-run `npm run photos`.

The original 21.5 MB `romantic-instrumental.wav` has been removed — the site plays the 1.5 MB AAC
encode of the same music instead. The whole repo is now about 7 MB.

---

## Deploy to GitHub Pages

1. Create a repository and push everything in this folder to the root.
2. **Settings → Pages → Build and deployment → Deploy from a branch.**
3. Choose `main` and `/ (root)`, then save.
4. The URL appears in a few minutes. Put it in the `SITE_URL` block above and push again.

There is **no build step on deploy** — GitHub Pages serves these files as they are. `npm run photos`
runs on your Mac, and you commit its output. The `.nojekyll` file stops Jekyll from touching anything.

## Local preview

```sh
npm run serve      # then open http://localhost:8080
```

Open it over `http://`, not by double-clicking `index.html` — the gallery loads `photos.json` with
`fetch()`, which browsers block on `file://` URLs. On `file://` the gallery quietly disappears and
the rest of the page works fine.

---

## Files

```text
index.html              markup, meta tags, SITE_URL block
styles.css              all styling; fonts are custom properties in :root
script.js               countdown, scroll effects, gallery, lightbox, music
photos/
  originals/            <- you add photos here
  optimized/            generated WebP (committed; the site serves these)
  photos.json           <- you write captions here
  README.md             the photo workflow in detail
config.json             <- everything that differs between the two repos
tools/build-photos.mjs  the photo optimiser (no npm dependencies)
tools/build-calendar.mjs generates the .ics from config.json
vendor/                 Swiper + GSAP, checked in on purpose. See vendor/README.md
assets/                 couple photo, music, calendar file, icons, share image
```

## Making changes

| To change | Edit |
|---|---|
| Names, parents, schedule, venues, RSVP contact | `config.json` (then `npm run calendar`) |
| Best-compliments names | `bestCompliments.names` in `config.json` |
| Fonts, sizes, weights, tracking | the TYPE SYSTEM block in `:root` in `styles.css` |
| Colours | the palette custom properties at the top of `styles.css` |
| Gallery heading | `gallery.heading` in `config.json` |
| RSVP wording, number, contact | `rsvp` block in `config.json` |
| Which photo folder is used | `gallery.photosDir` in `config.json` |
| Length of the opening gate scroll | `.gate-scene { height }` in `styles.css` |
| Countdown target | `countdownTarget` in `config.json` |

## Typography

Every font, size, weight, letter-spacing and line-height lives in one **TYPE SYSTEM** block at the
top of `styles.css`. Nothing below that block hardcodes a size or tracking — they all reference a
token, so the page stays uniform and one edit changes it everywhere.

Three faces, chosen to complement rather than compete:

| Face | Role | Why |
|---|---|---|
| **Cormorant Garamond** | headings *and* body | one family doing both keeps them visibly related; drawn for display use at light weights |
| **Italianno** | script flourishes only | true copperplate, for the kicker, the names, "weds" and the closing line |
| **Jost** | small-caps labels and buttons | geometric and neutral, which is what lets Cormorant carry the page |

Display text is set at weight **500** everywhere. Going heavier flattens Cormorant's stroke
contrast, which is the whole reason to use it.

The hero names are the one place where size can't be purely declarative: they come from
`config.json`, so `script.js` measures the rendered text and shrinks `--hero-fit` only if a name
would otherwise be clipped. "Shweta"/"Swapnil" need no shrinking on an iPhone 15; a 12-character
name scales to 0.897 and still fits.

## Notes

- **Music.** Browsers block audible autoplay until the visitor interacts with the page, so the
  site retries on load, scroll, touch, pointer, keypress and tab-focus, and always offers the
  music toggle in the corner.
- **Accessibility.** Honours `prefers-reduced-motion` (petals and parallax off, content still
  appears), the photo viewer is keyboard navigable and closes on Esc, and photo captions double as
  alt text when you don't write a separate one.
- **Graceful degradation.** If `vendor/` ever fails to load, the page still renders and reads
  correctly — the gallery falls back to a native scroll-snap row and reveals fall back to
  IntersectionObserver. Nothing throws.
- **Privacy.** The photo optimiser strips all EXIF metadata, so GPS coordinates baked in by phone
  cameras never reach the published site.
