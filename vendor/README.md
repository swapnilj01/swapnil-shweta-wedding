# Vendored libraries

These are checked in deliberately rather than loaded from a CDN, so the invite has **zero
third-party requests at runtime**. Guests opening it on patchy mobile data, or on venue wifi,
get the whole site from one origin. GitHub Pages gzips all of it automatically.

| File | Version | Source |
|---|---|---|
| `swiper/swiper-bundle.min.js` | 14.0.7 | `https://cdn.jsdelivr.net/npm/swiper@14.0.7/swiper-bundle.min.js` |
| `swiper/swiper-bundle.min.css` | 14.0.7 | `https://cdn.jsdelivr.net/npm/swiper@14.0.7/swiper-bundle.min.css` |
| `gsap/gsap.min.js` | 3.15.0 | `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js` |
| `gsap/ScrollTrigger.min.js` | 3.15.0 | `https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js` |

## Licenses

- **Swiper** — MIT. Full text in `swiper/LICENSE`.
- **GSAP + ScrollTrigger** — GreenSock Standard License, which covers this use (a site that
  isn't selling access to the animations). GSAP's npm package ships no standalone licence file;
  the notice is the `/*! ... @license ... */` banner at the top of each `.min.js`. **Leave those
  banners in place** — they are the attribution. Terms: <https://gsap.com/standard-license>.

## Upgrading

Re-download from the URLs above and bump the version in this table. Nothing else references the
version numbers, so there's no other file to keep in sync.

`index.html` loads all four with plain `<script>` / `<link>` tags and degrades gracefully: if any
of them fail to load, `script.js` detects the missing global and the page still renders and reads
correctly — just without the scroll choreography and with the gallery as a plain scrolling row.
