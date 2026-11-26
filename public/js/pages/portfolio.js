import { h, icon, toast, setBusy, copyText, clear, debounce } from '../ui.js';
import { get, put } from '../api.js';
import { renderPortfolio, loadPortfolioAssets } from './portfolio-public.js';
import { DESIGNS, PALETTES, TYPEFACES, resolveStyle, randomStyle } from '../portfolio-designs.js';

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export default async function portfolioPage() {
  await loadPortfolioAssets('all');
  const [{ portfolio: p }, { resumes }, { content: master }] = await Promise.all([get('/portfolio'), get('/resumes'), get('/profile')]);

  const f = { enabled: p.enabled, slug: p.slug || '', headline: p.headline || '', about: p.about || '', resumeId: p.resumeId || '', showContact: p.showContact, availability: p.availability || '', theme: p.theme || 'light', ...resolveStyle({ slug: p.slug || '', name: '', design: p.design, palette: p.palette, typeface: p.typeface }), links: (p.links || []).map((l) => ({ ...l })) };
  const cache = new Map();
  const source = async (id) => {
    if (!id) return { content: master, docId: null, issuedAt: null };
    if (!cache.has(id)) { const { resume } = await get('/resumes/' + id); cache.set(id, { content: resume.content, docId: resume.docId, issuedAt: resume.certifiedAt }); }
    return cache.get(id);
  };

  if (!f.slug) {
    const n = master.personal?.fullName || '';
    f.slug = slugify(n);
  }

  const previewHost = h('div', { class: 'pfe-prev-body' });
  const draw = async () => {
    const src = await source(f.resumeId);
    const c = src.content, pers = c.personal || {};
    const data = {
      name: pers.fullName || '', headline: f.headline || pers.headline || '', about: f.about || c.summary || '', location: pers.location || '',
      availability: f.availability, theme: f.theme, slug: f.slug, design: f.design, palette: f.palette, typeface: f.typeface, links: f.links, skills: c.skills || [], docId: src.docId, issuedAt: src.issuedAt,
      contact: f.showContact ? { email: pers.email || '', phone: pers.phone || '' } : null,
      experience: c.experience || [], projects: c.projects || [], education: c.education || [], certifications: c.certifications || [], languages: c.languages || [],
    };
    clear(previewHost).append(renderPortfolio(data, { preview: true }));
  };
  const redraw = debounce(() => draw().catch(() => {}), 250);
  const set = (k) => (e) => { f[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; redraw(); };

  const field = (label, control, hint) => h('div', { class: 'field' }, h('label', null, label), control, hint && h('span', { class: 'hint' }, hint));
  const slug = h('input', { class: 'input', value: f.slug, placeholder: 'your-name', autocapitalize: 'none', spellcheck: 'false', oninput: (e) => { f.slug = e.target.value; showUrl(); } });
  const url = () => `${location.origin}${location.pathname}#/p/${slugify(f.slug)}`;
  const urlLine = h('div', { class: 'small muted', style: 'word-break:break-all' });
  const showUrl = () => { clear(urlLine).append(url()); };
  showUrl();

  const about = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Defaults to your CV summary', oninput: set('about') });
  about.value = f.about;
  const rs = h('select', { class: 'select', onchange: (e) => { f.resumeId = e.target.value; redraw(); } }, h('option', { value: '' }, 'Master profile'),
    resumes.map((r) => h('option', { value: r.id, selected: r.id === f.resumeId }, r.title + (r.docId ? ' (certified)' : ''))));

  const seg = (key, opts) => {
    const box = h('div', { class: 'pfe-seg', role: 'group' });
    const paint = () => box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === f[key])));
    opts.forEach(([v, l]) => box.append(h('button', { type: 'button', 'data-v': v, onclick: () => { f[key] = v; paint(); redraw(); } }, l)));
    paint();
    return box;
  };

  const linkHost = h('div', { class: 'stack', style: 'gap:8px' });
  const drawLinks = () => {
    clear(linkHost);
    f.links.forEach((l, i) => linkHost.append(h('div', { class: 'row' },
      h('input', { class: 'input', placeholder: 'LinkedIn', value: l.label, style: 'max-width:130px', 'aria-label': 'Link label', oninput: (e) => { l.label = e.target.value; redraw(); } }),
      h('input', { class: 'input', placeholder: 'https://…', value: l.url, style: 'flex:1;min-width:0', 'aria-label': 'Link address', oninput: (e) => { l.url = e.target.value; redraw(); } }),
      h('button', { class: 'icon-btn danger', 'aria-label': 'Remove link', onclick: () => { f.links.splice(i, 1); drawLinks(); redraw(); } }, icon('trash', 'icon-sm')))));
    if (f.links.length < 8) linkHost.append(h('button', { class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: () => { f.links.push({ label: '', url: '' }); drawLinks(); } }, icon('plus', 'icon-sm'), 'Add link'));
  };
  drawLinks();


  // Design pickers: every control writes one of f.design / f.palette / f.typeface and redraws the preview.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sketch = (d) => { const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '0 0 60 40'); svg.setAttribute('aria-hidden', 'true');
    for (const [x, y, w, hh, t] of d.sketch) { const r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', hh); r.setAttribute('rx', Math.min(1.2, hh / 2)); r.setAttribute('class', 'sk' + t); svg.append(r); } return svg; };
  const picker = (key, items, render, cls) => {
    const box = h('div', { class: cls, role: 'radiogroup' });
    const paint = () => box.querySelectorAll('button').forEach((b) => { b.setAttribute('aria-checked', String(b.dataset.v === f[key])); });
    items.forEach((it) => box.append(Object.assign(render(it), { onclick: () => { f[key] = it.id; paint(); redraw(); } })));
    box.repaint = paint; paint();
    return box;
  };
  const designBox = picker('design', DESIGNS, (d) => h('button', { type: 'button', role: 'radio', class: 'pfe-design', 'data-v': d.id, title: d.desc }, sketch(d), h('b', null, d.name), h('small', null, d.desc)), 'pfe-designs');
  const paletteBox = picker('palette', PALETTES, (p2) => h('button', { type: 'button', role: 'radio', class: 'pfe-swatch', 'data-v': p2.id, 'aria-label': p2.name, title: p2.name, style: `--a:${p2.light.bg};--b:${p2.light.accent};--c:${p2.dark.bg};--d:${p2.dark.accent}` }, h('i'), h('span', null, p2.name)), 'pfe-swatches');
  const typeBox = picker('typeface', TYPEFACES, (t) => h('button', { type: 'button', role: 'radio', class: 'pfe-face', 'data-v': t.id, style: `font-family:${t.display},system-ui;font-weight:${t.dw}` }, 'Aa', h('span', { style: `font-family:${t.body},serif;font-weight:400` }, t.name)), 'pfe-faces');
  const surprise = h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => { Object.assign(f, randomStyle()); [designBox, paletteBox, typeBox].forEach((b) => b.repaint()); redraw(); } }, icon('sparkles', 'icon-sm'), 'Surprise me');

  const publish = h('input', { type: 'checkbox', checked: f.enabled, onchange: (e) => { f.enabled = e.target.checked; } });
  const contact = h('input', { type: 'checkbox', checked: f.showContact, onchange: set('showContact') });
  const save = h('button', { class: 'btn btn-brand', onclick: async () => {
    setBusy(save, true, 'Saving…');
    try {
      const out = await put('/portfolio', { ...f, slug: f.slug, design: f.design, palette: f.palette, typeface: f.typeface, links: f.links.filter((l) => l.label && l.url) });
      f.slug = out.portfolio.slug; slug.value = f.slug; showUrl();
      toast(out.portfolio.enabled ? 'Published.' : 'Saved. Your page is not public yet.');
      live.hidden = !(out.portfolio.enabled && out.portfolio.slug);
    } catch (e) { toast(e.message, 'error'); }
    setBusy(save, false);
  } }, 'Save');
  const live = h('div', { class: 'row row-wrap', hidden: !(p.enabled && p.slug) },
    h('a', { class: 'btn btn-outline', href: `/p/${p.slug}`, target: '_blank', rel: 'noopener' }, 'Open page'),
    h('button', { class: 'btn btn-ghost', onclick: () => copyText(url()) }, icon('copy'), 'Copy link'));

  draw().catch(() => {});

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Portfolio'), h('p', null, 'A page of your own, with a seal no one else has. What you change shows on the right.'))),
    h('div', { class: 'pfe' },
      h('div', { class: 'pfe-form card' },
        h('label', { class: 'check' }, publish, h('strong', null, 'Make this page public')),
        field('Web address', slug, undefined), urlLine,
        field('Built from', rs, 'Pick a certified CV and the page carries its seal and verification.'),
        field('Headline', h('input', { class: 'input', value: f.headline, placeholder: 'Defaults to your CV headline', oninput: set('headline') })),
        field('About', about),
        field('Availability', h('input', { class: 'input', value: f.availability, maxlength: 60, placeholder: 'Open to roles from January', oninput: set('availability') }), 'A short line next to your name. Leave empty to hide.'),
        h('div', { class: 'pfe-grp' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('strong', null, 'Design'), surprise), designBox),
        h('div', { class: 'pfe-grp' }, h('strong', null, 'Colours'), paletteBox),
        h('div', { class: 'pfe-grp' }, h('strong', null, 'Typeface'), typeBox),
        field('Theme', seg('theme', [['light', 'Light'], ['dark', 'Dark']]), 'Visitors can switch it themselves.'),
        h('label', { class: 'check' }, contact, h('span', null, 'Show my email and phone on the page')),
        field('Links', linkHost),
        h('div', { class: 'row row-wrap' }, save), live),
      h('div', { class: 'pfe-prev' }, h('div', { class: 'pfe-prev-bar' }, h('span', null, 'Live preview'), h('span', null, 'Not saved until you press Save')), previewHost)));
}
