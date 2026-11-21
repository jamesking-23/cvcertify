import { h, icon } from '../ui.js';
import { TEMPLATES, COUNTRIES } from '../shared/constants.js';
import { sampleContent } from './sample.js';
import { renderPaper } from '../preview.js';
import { state } from '../main.js';

const PHRASES = ['A job for everyone.', 'An identity for everyone.'];

// Infinite typewriter. The longest phrase is rendered invisibly in the same grid cell, so the headline keeps its height while text is typed and deleted.
export function typewriter() {
  const typed = h('span', { class: 'tw-text' }, PHRASES[0]);
  const cursor = h('span', { class: 'tw-cursor' }, '|');
  const ghost = h('span', { class: 'tw-ghost', 'aria-hidden': 'true' }, PHRASES.reduce((a, b) => (b.length > a.length ? b : a)), '|');
  const el = h('h1', { class: 'typewriter', 'aria-label': PHRASES[0] }, ghost, h('span', { class: 'tw-live', 'aria-hidden': 'true' }, typed, cursor));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return el;
  const TYPE = 85, DELETE = 45, HOLD = 2500, GAP = 400;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    let i = 0;
    await wait(HOLD);
    while (el.isConnected) {
      const cur = PHRASES[i];
      for (let n = cur.length - 1; n >= 0 && el.isConnected; n--) { typed.textContent = cur.slice(0, n); await wait(DELETE); }
      await wait(GAP);
      i = (i + 1) % PHRASES.length;
      const next = PHRASES[i];
      for (let n = 1; n <= next.length && el.isConnected; n++) { typed.textContent = next.slice(0, n); await wait(TYPE); }
      await wait(HOLD);
    }
  })();
  return el;
}

export function templatesPage() {
  return h('div', { class: 'container section' },
    h('div', { class: 'eyebrow' }, 'Templates'),
    h('h2', { style: 'margin:8px 0 14px' }, 'Clean layouts that pass applicant tracking systems'),
    h('p', { class: 'section-sub', style: 'margin:0 0 40px' }, 'Single-column, real text, standard headings. No tables, icons or images that parsers choke on. Pick a look; your content and country format stay the same.'),
    h('div', { class: 'grid grid-2' }, TEMPLATES.map((t) => h('div', { class: 'card' },
      h('div', { class: 'paper-wrap', style: 'margin-bottom:16px' }, renderPaper({ content: sampleContent(), template: t.id, country: 'UK' })),
      h('div', { class: 'row spread' }, h('h3', null, t.name), h('span', { class: 'chip chip-brand' }, `ATS: ${t.ats}`)),
      h('p', { class: 'muted small', style: 'margin-top:6px' }, t.desc)))),
    h('h3', { style: 'margin:56px 0 16px' }, 'Country-aware formats'),
    h('div', { class: 'grid grid-2' }, Object.values(COUNTRIES).map((c) => h('div', { class: 'card', style: 'padding:18px' }, h('div', { class: 'row spread' }, h('strong', null, c.name), h('span', { class: 'chip' }, `${c.doc} · ${c.paper}`)), h('p', { class: 'muted small', style: 'margin-top:6px' }, c.note)))),
    h('div', { class: 'center', style: 'margin-top:48px' }, h('a', { href: state.user ? '/app/resumes' : '/signup', class: 'btn btn-primary btn-lg' }, 'Use a template', icon('arrow'))));
}
