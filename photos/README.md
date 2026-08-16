# Adding photos to the gallery

## The whole workflow

1. **Drop photos into `photos/originals/`.** Straight off your phone is fine — JPG, PNG,
   **HEIC**, HEIF, TIFF and WebP all work. Don't resize or convert anything first.
2. **Run `npm run photos`** from the project root.
3. **Open `photos/photos.json` and write the captions.** New photos appear with an empty
   `"caption": ""` waiting for you.
4. Commit and push. GitHub Pages serves it as-is — there is no build step on deploy.

Give the files meaningful names before you drop them in: `haldi-morning-01.jpg` becomes the
caption key `haldi-morning-01`, which is much easier to find in the JSON than `IMG_4821`.

## What the script does

Each photo becomes three WebP sizes — 640px, 1024px and 1600px wide — plus a 24px blur
placeholder that gets inlined into the JSON so cards fade in instead of popping. The browser
downloads whichever size actually fits the screen, so a phone never pulls a 1600px image.

It **rotates photos upright.** Cameras don't rotate pixels when you turn the body sideways; they
just set an EXIF orientation flag. WebP encoders drop that flag, so a portrait shot would ship
sideways. The script reads the flag itself and bakes the rotation in.

It also **strips all EXIF metadata**, which matters: photos straight off a phone usually carry
GPS coordinates of where they were taken.

> **`photos/originals/` is gitignored on purpose.** Full-res camera files are ~15 MB each and git
> would keep them forever. Only `photos/optimized/` is committed — that's all the site needs.
> Keep your own backup of the originals; you need them here only to re-run this script.

## What you can edit

In `photos/photos.json`, these three fields are yours:

| Field | What it's for |
|---|---|
| `caption` | The line shown under the photo. |
| `event` | Small label above the caption — `Haldi`, `Mehendi`, `Sangeet`. Optional. |
| `alt` | Description for screen readers and for when an image fails to load. Optional but kind. |

Everything else (`src`, `srcset`, `full`, `width`, `height`, `lqip`) is regenerated each run and
will be overwritten.

**Reorder the `photos` array to reorder the gallery.** The order in the file is the order guests
see, so you control the story.

## Re-running is safe

- A caption you have written is **never** overwritten.
- Unchanged photos are skipped, so re-runs take about a second.
- `photos.json.bak` is written before every rewrite.
- If `photos.json` ever has a syntax error, the script copies it aside rather than discarding
  your captions, and tells you where.

## Removing a photo

Delete it from `photos/originals/` and re-run. The entry stays in `photos.json` marked
`"missing": true` instead of vanishing, so a caption you wrote is never silently lost. The
gallery skips missing entries. Once you're sure, delete the entry from the JSON and the stale
files from `photos/optimized/`.

## While the gallery is empty

The whole gallery section removes itself from the page. Nothing looks broken to guests
mid-way through you adding pictures.

## If `npm run photos` fails

It needs two tools. `sips` ships with macOS; `cwebp` comes from Homebrew:

```sh
brew install webp
```

On Windows or Linux this script won't run as-is — it depends on macOS's `sips`. Easiest
alternative there is to convert to WebP with [Squoosh](https://squoosh.app), drop the files
straight into `photos/optimized/`, and hand-write the JSON entries.
