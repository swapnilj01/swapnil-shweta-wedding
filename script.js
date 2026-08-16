/**
 * Shweta weds Swapnil — invitation behaviour.
 *
 *   config.json binding · countdown · scroll choreography (GSAP ScrollTrigger)
 *   falling petals · photo gallery + lightbox (Swiper) · background music
 *
 * The bride and groom repos share this file byte for byte; everything that
 * differs between them lives in config.json and photos/. Every value config
 * supplies also exists as hardcoded fallback text in index.html, so if
 * config.json fails to load the page still reads correctly.
 *
 * GSAP and Swiper are vendored in vendor/ and loaded before this file. Every
 * feature here is optional: if a library is missing the page still renders and
 * reads correctly, just with less choreography. Nothing throws.
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const hasSwiper = typeof window.Swiper !== 'undefined';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pad = (value, size = 2) => String(Math.max(0, value)).padStart(size, '0');
  const $ = id => document.getElementById(id);

  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);

  /** Fallback used only when config.json is missing or has no countdownTarget. */
  const DEFAULT_COUNTDOWN = '2026-12-23T07:00:00+05:30';

  const escapeHTML = str => String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));

  /* ---------------------------------------------------------------
     Countdown
     --------------------------------------------------------------- */
  function initCountdown(target) {
    const parsed = target ? new Date(target).getTime() : NaN;
    const weddingTime = Number.isFinite(parsed) ? parsed : new Date(DEFAULT_COUNTDOWN).getTime();
    const els = Object.fromEntries(
      ['days', 'hours', 'minutes', 'seconds'].map(id => [id, $(id)])
    );
    if (!els.days) return;

    const tick = () => {
      let diff = Math.max(0, weddingTime - Date.now());
      const days = Math.floor(diff / 86400000); diff -= days * 86400000;
      const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
      const minutes = Math.floor(diff / 60000); diff -= minutes * 60000;
      els.days.textContent = pad(days, 3);
      els.hours.textContent = pad(hours);
      els.minutes.textContent = pad(minutes);
      els.seconds.textContent = pad(Math.floor(diff / 1000));
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------------
     config.json

     Everything that differs between the bride and groom repos. Simple text
     comes from data-bind attributes; the three variable-length lists
     (schedule, venues, compliments) get dedicated renderers.
     --------------------------------------------------------------- */

  /** Resolve "couple.top.name" or "venues.0.address" against the config object. */
  const getPath = (obj, path) =>
    path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);

  const isText = v => typeof v === 'string' && v.trim() !== '';

  function applyBindings(cfg) {
    document.querySelectorAll('[data-bind]').forEach(el => {
      const value = getPath(cfg, el.dataset.bind);
      if (!isText(value)) return;              // keep the markup fallback
      if ('bindAmp' in el.dataset) {
        // "A & B" reads better stacked around a gold ampersand than on one line.
        const parts = value.split(/\s*&\s*/);
        el.innerHTML = parts.length > 1
          ? parts.map(escapeHTML).join('<br /><span>&amp;</span><br />')
          : escapeHTML(value);
      } else {
        el.textContent = value;
      }
    });
  }

  /** Group schedule entries by their `date`, preserving config order. */
  function groupByDate(schedule) {
    const days = [];
    for (const item of schedule) {
      const key = isText(item.date) ? item.date.trim() : '';
      let day = days.find(d => d.date === key);
      if (!day) { day = { date: key, items: [] }; days.push(day); }
      day.items.push(item);
    }
    return days;
  }

  /** "23 Dec" -> "23 December", so the day heading reads properly. */
  const MONTHS = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
                   jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  function longDate(short) {
    const m = String(short).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
    if (!m) return short;
    return `${m[1]} ${MONTHS[m[2].toLowerCase()] || m[2]}`;
  }

  function renderSchedule(cfg) {
    const host = $('scheduleDays');
    const schedule = Array.isArray(cfg?.schedule) ? cfg.schedule.filter(i => isText(i?.title)) : [];
    if (!host || !schedule.length) return;     // keep the markup fallback

    host.innerHTML = groupByDate(schedule).map(day => `
      <section class="schedule-day">
        ${day.date ? `<h3 class="schedule-day-label">${escapeHTML(longDate(day.date))}</h3>` : ''}
        <ol class="timeline">
          ${day.items.map(item => {
            const venue = isText(item.venueName)
              ? (isText(item.mapsUrl)
                  ? `<p class="timeline-venue"><a href="${escapeHTML(item.mapsUrl)}" target="_blank" rel="noreferrer">${escapeHTML(item.venueName)}</a></p>`
                  : `<p class="timeline-venue">${escapeHTML(item.venueName)}</p>`)
              : '';
            const time = isText(item.time) ? escapeHTML(item.time) : '';
            return `
            <li class="timeline-item">
              <p class="timeline-time">${isText(item.iso)
                ? `<time datetime="${escapeHTML(item.iso)}">${time}</time>` : time}</p>
              <div class="timeline-copy">
                <h3>${escapeHTML(item.title)}</h3>
                ${venue}
              </div>
            </li>`;
          }).join('')}
        </ol>
      </section>`).join('');
  }

  function renderVenues(cfg) {
    const host = $('venueList');
    const venues = Array.isArray(cfg?.venues) ? cfg.venues.filter(v => isText(v?.name)) : [];
    if (!host || !venues.length) return;       // keep the markup fallback

    // With a single venue the section heading carries its name, so repeating it
    // on the card would just say the same thing twice.
    const single = venues.length === 1;
    const heading = $('venueHeading');
    if (heading) heading.textContent = single ? venues[0].name : 'The venues';

    host.innerHTML = venues.map(v => `
      <article class="glass-card venue-card">
        ${single ? '' : `<h3>${escapeHTML(v.name)}</h3>`}
        ${isText(v.address) ? `<p class="venue-address">${escapeHTML(v.address)}</p>` : ''}
        ${isText(v.note) ? `<p class="venue-note">${escapeHTML(v.note)}</p>` : ''}
        ${isText(v.mapsUrl)
          ? `<a class="primary-btn" href="${escapeHTML(v.mapsUrl)}" target="_blank" rel="noreferrer">Open Google Maps</a>`
          : ''}
      </article>`).join('');
  }

  function renderCompliments(cfg) {
    const section = $('compliments');
    const host = $('complimentsList');
    const names = Array.isArray(cfg?.bestCompliments?.names)
      ? cfg.bestCompliments.names.filter(isText)
      : [];
    if (!section || !host) return;

    // No names yet? Hide the section rather than show an empty heading.
    if (!names.length) { section.remove(); return; }
    host.innerHTML = names.map(n => `<li>${escapeHTML(n)}</li>`).join('');
    section.hidden = false;
  }

  /**
   * The whole RSVP block comes from config, not just the number — the two sides
   * point at different parents, and may want different wording.
   *
   * Optional keys: heading, message, buttonLabel, callLabel, smsBody.
   */
  function renderRsvp(cfg) {
    const rsvp = cfg?.rsvp;
    if (!rsvp) return;

    const phone = isText(rsvp.phone) ? rsvp.phone.replace(/[^\d+]/g, '') : '';
    const btn = $('rsvpBtn');
    const call = $('rsvpCallBtn');
    const name = $('rsvpContactName');
    const relation = $('rsvpContactRelation');
    const label = $('rsvpButtonLabel');
    const heading = $('rsvpHeading');
    const message = $('rsvpMessage');

    if (isText(rsvp.heading) && heading) heading.textContent = rsvp.heading;
    if (isText(rsvp.message) && message) message.textContent = rsvp.message;
    if (isText(rsvp.buttonLabel) && label) label.textContent = rsvp.buttonLabel;
    if (isText(rsvp.contactName) && name) name.textContent = rsvp.contactName;
    if (isText(rsvp.contactRelation) && relation) relation.textContent = rsvp.contactRelation;
    if (isText(rsvp.callLabel) && call) call.textContent = rsvp.callLabel;

    if (phone) {
      // iOS wants sms:number&body=, Android wants sms:number?body=. Skipping the
      // prefill entirely is the one thing that behaves the same everywhere.
      if (btn) btn.href = isText(rsvp.smsBody)
        ? `sms:${phone}${/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(rsvp.smsBody)}`
        : `sms:${phone}`;
      if (call) call.href = `tel:${phone}`;
    } else {
      // No number configured: an sms: link to nowhere is worse than no button.
      btn?.remove();
      call?.remove();
      relation?.remove();
    }
  }

  async function initFromConfig() {
    let cfg = null;
    try {
      const res = await fetch('config.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cfg = await res.json();
    } catch (error) {
      console.info('[config] using markup defaults:', error.message);
    }

    if (cfg) {
      applyBindings(cfg);
      renderSchedule(cfg);
      renderVenues(cfg);
      renderRsvp(cfg);
    }
    // Runs either way: with no config there are no names, so the section goes.
    renderCompliments(cfg);
    return cfg;
  }

  /* ---------------------------------------------------------------
     Falling petals

     Previously this built up to 72 nodes and rewrote a custom property on
     every one of them on every scroll frame. Now each petal keeps its CSS
     keyframe animation and scroll moves ONE element — the container — so the
     parallax costs a single style write per frame instead of 72.
     --------------------------------------------------------------- */
  function initPetals() {
    const field = $('petalField');
    if (!field || reduceMotion) return null;

    const count = window.innerWidth < 640 ? 20 : 34;
    const frag = document.createDocumentFragment();

    for (let i = 0; i < count; i += 1) {
      const petal = document.createElement('span');
      petal.className = `petal${i % 5 === 0 ? ' large' : ''}${i % 7 === 0 ? ' soft' : ''}`;
      petal.style.left = `${Math.random() * 100}vw`;
      petal.style.setProperty('--size', `${9 + Math.random() * 24}px`);
      petal.style.setProperty('--dur', `${9 + Math.random() * 13}s`);
      petal.style.setProperty('--delay', `${-1 * Math.random() * 18}s`);
      petal.style.setProperty('--drift', `${Math.round(Math.random() * 180 - 90)}px`);
      petal.style.setProperty('--rot', `${Math.random() * 360}deg`);
      petal.style.setProperty('--opacity', `${0.3 + Math.random() * 0.48}`);
      petal.style.setProperty('--depth', `${Math.round(Math.random() * 220 - 110)}px`);
      petal.style.setProperty('--drift-base', `${Math.round(Math.random() * 70 - 35)}px`);
      frag.appendChild(petal);
    }
    field.appendChild(frag);
    return field;
  }

  /* ---------------------------------------------------------------
     Scroll choreography

     The gate-opening easing is the original hand-tuned maths, unchanged —
     it just runs inside a ScrollTrigger now so it's frame-synced with the
     rest of the animation instead of racing its own rAF loop.
     --------------------------------------------------------------- */
  /**
   * Fade a group of elements in as they scroll into view.
   *
   * Call this once per group, and only once the elements are actually laid out.
   * ScrollTrigger measures positions when a trigger is created, so registering
   * an element while its section is still `hidden` produces a trigger that never
   * fires — which is how the gallery could end up in the DOM but stuck at
   * opacity 0. The gallery therefore calls this itself after it un-hides.
   */
  function revealOnScroll(elements) {
    if (!elements.length) return;

    if (hasGSAP) {
      ScrollTrigger.batch(elements, {
        start: 'top 88%',
        once: true,
        onEnter: batch => batch.forEach((el, i) => {
          gsap.delayedCall(reduceMotion ? 0 : i * 0.09, () => el.classList.add('in-view'));
        }),
      });
      return;
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
        });
      }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
      elements.forEach(el => io.observe(el));
      return;
    }

    elements.forEach(el => el.classList.add('in-view'));
  }

  function initScrollEffects(petalField) {
    const gateScene = document.querySelector('.gate-scene');
    const layers = [...document.querySelectorAll('.parallax-layer')].filter(el => !el.closest('#gallery'));
    // The gallery is still hidden at this point and reveals itself later.
    const revealables = [...document.querySelectorAll('.reveal, .reveal-stagger')]
      .filter(el => !el.closest('#gallery'));

    // Without GSAP: reveal on scroll, open the gate, skip parallax.
    // The page reads perfectly, it just doesn't dance.
    if (!hasGSAP) {
      root.style.setProperty('--gate-open', '1');
      revealOnScroll(revealables);
      return;
    }

    if (gateScene) {
      ScrollTrigger.create({
        trigger: gateScene,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        onUpdate: self => {
          const p = clamp(self.progress, 0, 1);
          // easeInOutQuad — same curve the original used.
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          root.style.setProperty('--gate-open', eased.toFixed(4));
        },
      });
    }

    // matchMedia so GSAP tears all of this down (and reverts inline styles)
    // when the visitor turns on Reduce Motion.
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      layers.forEach(layer => {
        const speed = Number(layer.dataset.speed || 0);
        if (!speed) return;
        gsap.fromTo(layer,
          { y: () => -speed * 130 },
          {
            y: () => speed * 130,
            ease: 'none',
            scrollTrigger: { trigger: layer, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          }
        );
      });

      if (petalField) {
        gsap.to(petalField, {
          y: 90,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: true },
        });
      }
    });

    // Reveals run regardless of motion preference — the CSS transition is what
    // gets neutralised by the reduced-motion block, so content always appears.
    revealOnScroll(revealables);

    // Fonts land after first paint and change element heights, so remeasure.
    if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /**
   * Persistent scroll indicator, pinned bottom-centre for the whole page.
   *
   * The ring fills with scroll progress, so it reads as "how much is left"
   * rather than just "there is more". Tapping it advances to the next section;
   * once you reach the end it flips to point up and goes back to the top.
   *
   * Driven by a plain passive scroll listener rather than ScrollTrigger: it
   * must stay correct even if the layout shifts, and it costs one rAF-throttled
   * write of two custom properties.
   */
  function initScrollCue() {
    const cue = $('scrollCue');
    const bar = $('scrollCueBar');
    if (!cue) return;

    const CIRCUMFERENCE = 2 * Math.PI * 21;   // r=21 in the SVG
    let atEnd = false;
    let ticking = false;

    const sections = () => [...document.querySelectorAll('main > section')]
      .filter(s => !s.hidden && s.offsetParent !== null);

    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const y = window.scrollY || window.pageYOffset || 0;
      const progress = clamp(y / max, 0, 1);

      if (bar) bar.style.setProperty('--scroll-dash', String(CIRCUMFERENCE * (1 - progress)));

      // Near the bottom the cue becomes back-to-top.
      const end = progress > 0.985;
      if (end !== atEnd) {
        atEnd = end;
        cue.classList.toggle('is-top', end);
        cue.setAttribute('aria-label', end ? 'Back to top' : 'Scroll to the next section');
      }
      // Hide it while the gates are still shut — the closed title says "scroll"
      // already, and two prompts at once is noise.
      cue.classList.toggle('is-hidden', y < 40);
    }

    const onScroll = () => {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();

    cue.addEventListener('click', () => {
      const smooth = reduceMotion ? 'auto' : 'smooth';
      if (atEnd) { window.scrollTo({ top: 0, behavior: smooth }); return; }
      // Advance to the first section whose top is meaningfully below the fold.
      const next = sections().find(s => s.getBoundingClientRect().top > 24);
      if (next) next.scrollIntoView({ behavior: smooth, block: 'start' });
      else window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth });
    });
  }

  /**
   * Shrink the hero names just enough to fit the width.
   *
   * The type scale is tuned so "Shweta" and "Swapnil" fit an iPhone 15, but the
   * names come from config.json — the groom repo swaps them, and a longer one
   * would silently get clipped by .gate-sticky's overflow:hidden. This measures
   * the real rendered text and scales down only when it has to.
   */
  function initHeroFit() {
    const h1 = document.querySelector('h1');
    if (!h1) return;
    const spans = [...h1.querySelectorAll('span')];
    if (!spans.length) return;

    /* A Range measures the text itself, so a clipped parent can't hide the
       true width the way scrollWidth sometimes does. */
    const textWidth = el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width;
    };

    const fit = () => {
      h1.style.setProperty('--hero-fit', '1');
      const available = h1.clientWidth;
      if (!available) return;
      const widest = Math.max(...spans.map(textWidth));
      if (widest > available) {
        // 0.98 leaves a hair of breathing room; 0.6 stops a pathological name
        // shrinking the title into illegibility.
        h1.style.setProperty('--hero-fit', Math.max(0.6, (available / widest) * 0.98).toFixed(3));
      }
    };

    fit();
    // Cormorant loads after first paint and is wider than the fallback serif.
    document.fonts?.ready.then(fit);
    window.addEventListener('resize', fit, { passive: true });
    window.addEventListener('orientationchange', fit, { passive: true });
  }

  /* ---------------------------------------------------------------
     Section dividers

     Built here rather than in the markup so they can only ever appear between
     two sections that actually survived: the gallery and compliments sections
     remove themselves, which would otherwise strand a divider.
     --------------------------------------------------------------- */
  function initSectionDividers() {
    const sections = [...document.querySelectorAll('main > section')]
      .filter(s => !s.hidden && s.id !== 'top');   // the gate scene is sticky; leave its edge alone
    if (sections.length < 2) return;

    const dividers = [];
    sections.slice(0, -1).forEach(section => {
      const divider = document.createElement('div');
      divider.className = 'section-divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.innerHTML = '<span class="section-divider-rule"></span><span class="section-divider-motif"></span>';
      section.after(divider);
      dividers.push(divider);
    });

    if (!hasGSAP || reduceMotion) return;        // static dividers are fine

    dividers.forEach(divider => {
      const rule = divider.querySelector('.section-divider-rule');
      const motif = divider.querySelector('.section-divider-motif');

      // Draw the rule outward from the motif as the divider comes into view.
      gsap.fromTo(rule,
        { '--divider-scale': 0.1, '--divider-opacity': 0 },
        {
          '--divider-scale': 1, '--divider-opacity': 1, ease: 'none',
          scrollTrigger: { trigger: divider, start: 'top 96%', end: 'top 62%', scrub: true, invalidateOnRefresh: true },
        }
      );
      // The motif turns with the scroll, and unwinds when you scroll back up.
      gsap.fromTo(motif,
        { '--divider-spin': '0deg' },
        {
          '--divider-spin': '180deg', ease: 'none',
          scrollTrigger: { trigger: divider, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
        }
      );
    });
  }

  /* ---------------------------------------------------------------
     Photo gallery
     --------------------------------------------------------------- */

  /** A photo is usable if the build script gave it something to render. */
  const usable = p => p && !p.missing && typeof p.src === 'string' && p.src.trim() !== '';

  /**
   * One card shape for the whole rail, chosen from the photos themselves.
   *
   * A uniform shape is what stops the row looking ragged, but hardcoding a
   * portrait box would crop a set of landscape photos to about half their width
   * and cut people out of group shots. So take the median orientation and clamp
   * it: a landscape set gets landscape cards, a portrait set gets portrait ones,
   * and a mixed set crops only the minority.
   */
  function cardRatio(photos) {
    const ratios = photos
      .map(p => (Number(p.width) > 0 && Number(p.height) > 0 ? p.width / p.height : null))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!ratios.length) return 0.8;                       // 4:5, a sensible default
    const median = ratios[Math.floor(ratios.length / 2)];
    return clamp(median, 0.72, 1.5);                      // never narrower than 18:25 or wider than 3:2
  }

  function cardMarkup(photo, index) {
    const caption = escapeHTML(photo.caption).trim();
    const event = escapeHTML(photo.event).trim();
    // Fall back to the caption for alt text; an empty alt on a meaningful image
    // is worse than a slightly redundant one.
    const alt = escapeHTML(photo.alt).trim() || caption || 'Wedding celebration photo';

    // Every card shares one media box, sized by cardRatio() from the whole set.
    // object-fit: cover keeps them tidy whatever each individual photo's shape is.
    return `
      <div class="swiper-slide">
        <figure class="photo-card">
          <div class="photo-card-media" style="--lqip: url('${photo.lqip || ''}');">
            <img src="${escapeHTML(photo.src)}"
                 ${photo.srcset ? `srcset="${escapeHTML(photo.srcset)}"` : ''}
                 sizes="(min-width: 960px) 324px, (min-width: 720px) 300px, 78vw"
                 width="${photo.width || 800}" height="${photo.height || 1000}"
                 alt="${alt}" loading="lazy" decoding="async" />
            <button class="photo-card-zoom" type="button" data-index="${index}"
                    aria-label="View photo${caption ? `: ${caption}` : ''} full screen"></button>
          </div>
          ${caption || event ? `
          <figcaption class="photo-card-body">
            ${event ? `<p class="photo-card-event">${event}</p>` : ''}
            ${caption ? `<p class="photo-card-caption">${caption}</p>` : ''}
          </figcaption>` : ''}
        </figure>
      </div>`;
  }

  function lightboxMarkup(photo) {
    const caption = escapeHTML(photo.caption).trim();
    const event = escapeHTML(photo.event).trim();
    const alt = escapeHTML(photo.alt).trim() || caption || 'Wedding celebration photo';
    return `
      <div class="swiper-slide">
        <img src="${escapeHTML(photo.full || photo.src)}" alt="${alt}" loading="lazy" decoding="async" />
        ${caption || event ? `
        <div class="lightbox-caption">
          ${event ? `<p class="photo-card-event">${event}</p>` : ''}
          ${caption ? `<p class="photo-card-caption">${caption}</p>` : ''}
        </div>` : ''}
      </div>`;
  }

  /** Blur up from the inlined placeholder once the real image has decoded. */
  function fadeInWhenLoaded(scope) {
    scope.querySelectorAll('.photo-card-media img').forEach(img => {
      if (img.complete && img.naturalWidth) { img.classList.add('is-loaded'); return; }
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      // A broken image should not sit as a permanent blurred placeholder.
      img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
    });
  }

  function initLightbox(photos) {
    const dialog = $('lightbox');
    const slides = $('lightboxSlides');
    if (!dialog || !slides || typeof dialog.showModal !== 'function') return null;

    let swiper = null;
    let built = false;

    const build = () => {
      if (built) return;
      slides.innerHTML = photos.map(lightboxMarkup).join('');
      built = true;
    };

    const open = index => {
      build();
      dialog.showModal();
      document.body.classList.add('lightbox-open');

      if (hasSwiper && !swiper) {
        swiper = new Swiper('#lightboxSwiper', {
          slidesPerView: 1,
          spaceBetween: 0,
          keyboard: { enabled: true },
          navigation: { prevEl: '#lightboxPrev', nextEl: '#lightboxNext' },
          a11y: { enabled: true, prevSlideMessage: 'Previous photo', nextSlideMessage: 'Next photo' },
        });
      }
      // slideTo needs the dialog to be laid out, which only happens after showModal.
      if (swiper) { swiper.update(); swiper.slideTo(index, 0); }
      else slides.children[index]?.scrollIntoView({ block: 'nearest' });
    };

    const close = () => { if (dialog.open) dialog.close(); };

    $('lightboxClose')?.addEventListener('click', close);
    // Clicking the backdrop (i.e. the dialog itself, outside the image) closes.
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('close', () => document.body.classList.remove('lightbox-open'));

    return { open };
  }

  async function initGallery(cfg) {
    const section = $('gallery');
    const slidesEl = $('gallerySlides');
    if (!section || !slidesEl) return;

    const photosPath = isText(cfg?.gallery?.photosJson) ? cfg.gallery.photosJson : 'photos/photos.json';

    let data;
    try {
      const response = await fetch(photosPath, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    } catch (error) {
      // No gallery is a perfectly fine state — the invitation is the point.
      console.info('[gallery] no photos loaded:', error.message);
      section.remove();
      return;
    }

    const photos = (Array.isArray(data?.photos) ? data.photos : []).filter(usable);
    if (!photos.length) {
      section.remove();
      return;
    }

    // config.json wins over photos.json, so the two repos can word this
    // differently without touching the photo data.
    const headingEl = section.querySelector('[data-gallery-heading]');
    const heading = isText(cfg?.gallery?.heading) ? cfg.gallery.heading : data.heading;
    if (headingEl && isText(heading)) headingEl.textContent = heading.trim();

    section.style.setProperty('--card-ratio', String(cardRatio(photos)));
    slidesEl.innerHTML = photos.map(cardMarkup).join('');
    section.hidden = false;
    fadeInWhenLoaded(slidesEl);

    const lightbox = initLightbox(photos);
    if (lightbox) {
      slidesEl.addEventListener('click', event => {
        const btn = event.target.closest('.photo-card-zoom');
        if (btn) lightbox.open(Number(btn.dataset.index) || 0);
      });
    } else {
      // No <dialog> support: the zoom buttons would do nothing, so remove them.
      slidesEl.querySelectorAll('.photo-card-zoom').forEach(b => b.remove());
    }

    const hint = $('galleryHint');
    const hideHint = () => hint?.classList.add('is-hidden');

    if (hasSwiper) {
      const swiper = new Swiper('#gallerySwiper', {
        slidesPerView: 'auto',
        spaceBetween: 16,
        grabCursor: true,
        freeMode: { enabled: true, sticky: false, momentumBounce: false },
        scrollbar: { el: '#galleryScrollbar', draggable: true, hide: false },
        mousewheel: { forceToAxis: true, sensitivity: 0.6 },
        keyboard: { enabled: true, onlyInViewport: true },
        a11y: { enabled: true, containerMessage: 'Photo gallery. Use arrow keys to browse.' },
        // Only decorative — never let a broken observer stop the carousel working.
        resizeObserver: true,
        watchOverflow: true,
      });
      swiper.once('sliderFirstMove', hideHint);
      swiper.on('scrollbarDragStart', hideHint);
    } else {
      // CSS scroll-snap fallback. Same cards, native scrolling.
      const rail = $('gallerySwiper');
      rail?.classList.add('is-fallback');
      rail?.addEventListener('scroll', hideHint, { once: true, passive: true });
    }

    // Now that the section is laid out, register its reveals and its parallax.
    // initScrollEffects deliberately skipped everything inside #gallery, because
    // back then this section was still hidden and would have measured as zero.
    if (hasGSAP) {
      ScrollTrigger.refresh();   // the gallery just added a lot of page height

      const bloom = section.querySelector('.parallax-layer[data-speed]');
      const speed = bloom ? Number(bloom.dataset.speed || 0) : 0;
      if (bloom && speed && !reduceMotion) {
        gsap.fromTo(bloom,
          { y: -speed * 130 },
          {
            y: speed * 130,
            ease: 'none',
            scrollTrigger: { trigger: bloom, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
          }
        );
      }
    }
    revealOnScroll([...section.querySelectorAll('.reveal, .reveal-stagger')]);
  }

  /* ---------------------------------------------------------------
     Background music

     Browsers block audible autoplay until the visitor interacts, so we retry
     on the first few interaction events and expose a toggle either way.
     --------------------------------------------------------------- */
  function initMusic() {
    const music = $('bgMusic');
    const pill = $('musicPill');
    if (!music) return;

    let userPaused = false;
    let attemptedUnlock = false;

    const sync = () => {
      if (!pill) return;
      pill.classList.toggle('paused', music.paused);
      const label = pill.querySelector('b');
      if (label) label.textContent = music.paused ? 'Music' : 'Music on';
      pill.setAttribute('aria-pressed', String(!music.paused));
    };

    async function start(force = false) {
      if (userPaused) return;
      try {
        music.volume = 0.34;
        music.muted = false;
        await music.play();
        attemptedUnlock = true;
      } catch {
        // Fall back to starting muted, then unmuting — some browsers allow this.
        if (force && !attemptedUnlock) {
          try {
            music.muted = true;
            await music.play();
            setTimeout(() => { music.muted = false; music.volume = 0.34; sync(); }, 350);
          } catch { /* autoplay genuinely blocked; the pill still works */ }
        }
      } finally {
        sync();
      }
    }

    start(true);
    window.addEventListener('load', () => start(true), { once: true });
    ['pointerdown', 'touchstart', 'wheel', 'scroll', 'keydown'].forEach(type => {
      window.addEventListener(type, () => start(false), { passive: true, once: true });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) start(false); });

    pill?.addEventListener('click', async () => {
      if (music.paused) { userPaused = false; await start(false); }
      else { userPaused = true; music.pause(); sync(); }
    });
    sync();
  }

  /* ---------------------------------------------------------------
     Go

     Order matters: config populates the DOM first, so ScrollTrigger measures
     the final layout. Measuring before the schedule and venue lists are built
     would leave triggers pointing at stale positions — the same class of bug
     that `content-visibility: auto` used to cause here.
     --------------------------------------------------------------- */
  (async () => {
    const cfg = await initFromConfig();
    initHeroFit();                    // after binding: the names may have changed
    initCountdown(cfg?.countdownTarget);
    initScrollEffects(initPetals());
    initMusic();
    // Must come after the gallery has decided whether it exists, so a divider
    // is never left stranded next to a section that removed itself.
    await initGallery(cfg);
    initSectionDividers();
    initScrollCue();
    // Dividers add height; everything measured before now needs remeasuring.
    if (hasGSAP) ScrollTrigger.refresh();
  })();
})();
