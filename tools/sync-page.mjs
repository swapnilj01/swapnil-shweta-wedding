#!/usr/bin/env node
/**
 * Rewrites index.html from config.json.
 *
 *   npm run sync        (also part of `npm run build`)
 *
 * Two jobs:
 *
 * 1. <head>. Link previews (WhatsApp, iMessage, Facebook) read the HTML
 *    without running JavaScript, so the title, URL and og:/twitter: tags must
 *    be baked in. They come from config.site.
 *
 * 2. Fallback text. Every config-driven element also carries hardcoded text,
 *    shown only if config.json fails to load. On the groom site that text must
 *    not be the bride's schedule, so it's regenerated from this repo's config.
 *
 * Because of this, index.html is identical in both repos except for what this
 * script writes — copy it across, run this, done. Safe to run repeatedly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const HTML = path.join(ROOT, 'index.html');
let s = readFileSync(HTML, 'utf8');
const original = s;

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const get = p => p.split('.').reduce((o, k) => o?.[k], cfg);
const text = v => typeof v === 'string' && v.trim() !== '';
const MON = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
              jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
const longDate = d => { const m = String(d).match(/^(\d{1,2})\s+([A-Za-z]{3})/); return m ? `${m[1]} ${MON[m[2].toLowerCase()] || m[2]}` : d; };
const warnings = [];

// ---------- 1. <head> ----------
const site = cfg.site || {};
const setAttr = (selector, value) => {
  if (!text(value)) return;
  const re = new RegExp(`(<${selector}[^>]*?\\s(?:content|href)=")[^"]*(")`);
  if (re.test(s)) s = s.replace(re, `$1${esc(value)}$2`);
  else warnings.push(`head: no tag matching <${selector}>`);
};
if (text(site.url)) {
  const url = site.url.endsWith('/') ? site.url : `${site.url}/`;
  setAttr('link rel="canonical"', url);
  setAttr('meta property="og:url"', url);
  setAttr('meta property="og:image"', `${url}assets/og-cover.jpg`);
  s = s.replace(/(SITE_URL = )\S+/, `$1${url}`);
}
if (text(site.title)) s = s.replace(/<title>[^<]*<\/title>/, `<title>${esc(site.title)} | Wedding Invitation</title>`);
setAttr('meta property="og:site_name"', site.title);
setAttr('meta property="og:title"', site.shareTitle);
setAttr('meta name="twitter:title"', site.shareTitle);
setAttr('meta name="description"', site.description);
setAttr('meta property="og:description"', site.description);
setAttr('meta name="twitter:description"', site.description);
setAttr('meta property="og:image:alt"', site.imageAlt);

// ---------- 2a. every [data-bind] element ----------
s = s.replace(/(<([a-z0-9]+)([^>]*?\sdata-bind="([^"]+)"[^>]*)>)([\s\S]*?)(<\/\2>)/g,
  (all, open, tag, attrs, key, inner, close) => {
    const v = get(key);
    if (!text(v)) return all;
    const html = /\sdata-bind-amp/.test(attrs) && v.includes('&')
      ? v.split(/\s*&\s*/).map(esc).join('<br /><span>&amp;</span><br />')
      : esc(v);
    return open + html + close;
  });

// ---------- 2b. schedule, grouped by day exactly as script.js renders it ----------
const schedule = (cfg.schedule || []).filter(e => text(e?.title));
const days = [];
for (const e of schedule) {
  let d = days.find(x => x.date === e.date);
  if (!d) days.push(d = { date: e.date, items: [] });
  d.items.push(e);
}
const scheduleHtml = days.map(d => `
        <section class="schedule-day">
          <h3 class="schedule-day-label">${esc(longDate(d.date))}</h3>
          <ol class="timeline">${d.items.map(e => `
            <li class="timeline-item">
              <p class="timeline-time"><time datetime="${esc(e.iso)}">${esc(e.time)}</time></p>
              <div class="timeline-copy"><h3>${esc(e.title)}</h3>${text(e.venueName) ? `<p class="timeline-venue">${esc(e.venueName)}</p>` : ''}</div>
            </li>`).join('')}
          </ol>
        </section>`).join('');
const scheduleBlock = /(<div class="schedule-days reveal" id="scheduleDays">)[\s\S]*?(\n      <\/div>)/;
if (!scheduleBlock.test(s)) warnings.push('schedule fallback block not found');
s = s.replace(scheduleBlock, (m, a, b) => a + scheduleHtml + b);

// ---------- 2c. venues, with event lists derived from the schedule ----------
const norm = t => String(t || '').trim().toLowerCase();
const eventsAt = name => schedule.filter(e => norm(e.venueName) === norm(name)
  || norm(e.venueName).split('→').pop().trim() === norm(name));
const venues = (cfg.venues || []).filter(v => text(v?.name));
const single = venues.length === 1;
s = s.replace(/(<h2 id="venueHeading">)[^<]*(<\/h2>)/, (m, a, b) => a + esc(single ? venues[0].name : 'The venues') + b);
const venueHtml = venues.map(v => {
  const list = eventsAt(v.name);
  const events = text(v.note) ? `
          <p class="venue-note">${esc(v.note)}</p>` : list.length ? `
          <ul class="venue-events">${list.map(e => `
            <li><span class="venue-event-name">${esc(e.title)}</span>
                <span class="venue-event-when">${esc([e.date, e.time].filter(text).join(' · '))}</span></li>`).join('')}
          </ul>` : '';
  return `
        <article class="glass-card venue-card">${single ? '' : `
          <h3>${esc(v.name)}</h3>`}${text(v.address) ? `
          <p class="venue-address">${esc(v.address)}</p>` : ''}${events}${text(v.mapsUrl) ? `
          <a class="primary-btn" href="${esc(v.mapsUrl)}" target="_blank" rel="noreferrer">Open Google Maps</a>` : ''}
        </article>`;
}).join('');
s = s.replace(/(<div class="venue-list reveal-stagger" id="venueList">)[\s\S]*?(\n      <\/div>)/, (m, a, b) => a + venueHtml + b);

// ---------- 2d. RSVP (set by id in script.js, not data-bind) ----------
const r = cfg.rsvp || {};
const byId = (id, value) => {
  if (!text(value)) return;
  const re = new RegExp(`(<([a-z0-9]+)[^>]*\\sid="${id}"[^>]*>)[\\s\\S]*?(<\\/\\2>)`);
  if (re.test(s)) s = s.replace(re, `$1${esc(value)}$3`);
};
byId('rsvpHeading', r.heading);
byId('rsvpMessage', r.message);
byId('rsvpButtonLabel', r.buttonLabel);
byId('rsvpContactName', r.contactName);
byId('rsvpContactRelation', r.contactRelation);
byId('rsvpCallBtn', r.callLabel);
byId('complimentsHeading', cfg.bestCompliments?.heading);
if (text(r.phone)) {
  const phone = r.phone.replace(/[^\d+]/g, '');
  s = s.replace(/(id="rsvpBtn" href=")[^"]*(")/, `$1sms:${phone}$2`);
  s = s.replace(/(id="rsvpCallBtn" href=")[^"]*(")/, `$1tel:${phone}$2`);
}

writeFileSync(HTML, s);
console.log(`\nSynced index.html from config.json (${cfg.side || 'unknown'} side)${s === original ? ' — already up to date' : ''}`);
console.log(`  ${schedule.length} events over ${days.length} day(s), ${venues.length} venue(s)`);
if (text(site.url)) console.log(`  share URL: ${site.url}`);
for (const w of warnings) console.warn(`  ! ${w}`);
console.log('');
