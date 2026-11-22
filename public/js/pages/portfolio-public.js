import { h, setTitle } from '../ui.js';
import { get } from '../api.js';
import { formatMonth } from '../shared/constants.js';
import { seal } from '../seal.js';

let assets;
export function loadPortfolioAssets() {
  if (assets) return assets;
  const link = (href) => new Promise((res) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = l.onerror = res; document.head.append(l); });
  assets = Promise.all([
    link('css/portfolio.css'),
    link('https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&display=swap'),
  ]);
  return assets;
}

const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
const initialsOf = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const range = (e) => [formatMonth(e.start), e.current ? 'Present' : formatMonth(e.end)].filter(Boolean).join(' – ');
const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');

function readTheme(fallback) {
  try { const t = localStorage.getItem('cvc_pf_theme'); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked */ }
  return fallback === 'dark' ? 'dark' : 'light';
}

/** Builds the portfolio DOM from public data. Used by the live page and by the editor preview. */
export function renderPortfolio(d, { preview = false } = {}) {
  const root = h('div', { class: 'pf', 'data-theme': preview ? d.theme : readTheme(d.theme) });
  const sec = (title, ...body) => h('section', { class: 'pf-sec' }, h('h2', null, title), h('div', null, ...body));
  const sealed = !!d.docId;
  const links = (d.links || []).filter((l) => l.label && /^https?:\/\//i.test(l.url));
  const skills = (d.skills || []).filter(Boolean);

  const themeBtn = (mode, label) => h('button', { type: 'button', 'aria-pressed': String(root.dataset.theme === mode), onclick: () => {
    root.dataset.theme = mode;
    try { localStorage.setItem('cvc_pf_theme', mode); } catch { /* ignore */ }
    toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }, 'data-mode': mode }, label);
  const toggle = h('div', { class: 'pf-toggle', role: 'group', 'aria-label': 'Colour theme' }, themeBtn('light', 'Light'), themeBtn('dark', 'Dark'));

  root.append(h('div', { class: 'pf-wrap' },
    h('header', { class: 'pf-top' },
      h('a', { class: 'pf-mark', href: '/', 'aria-label': 'CV-Certify home' }, h('i'), 'CV-Certify'),
      preview ? null : toggle),
    h('main', { id: 'main' },
      h('section', { class: 'pf-hero' },
        h('div', null,
          h('h1', { class: 'pf-name' }, d.name || 'Your name'),
          d.headline && h('p', { class: 'pf-headline' }, d.headline),
          (d.location || d.availability) && h('div', { class: 'pf-meta' }, d.location && h('span', null, d.location), d.availability && h('span', { class: 'pf-avail' }, d.availability))),
        h('div', { class: 'pf-seal' }, seal(d.docId || d.name || 'cvc', { initials: initialsOf(d.name), sealed, size: 330 }))),

      d.about && sec('About', h('p', { class: 'pf-about' }, d.about)),

      (d.experience || []).length > 0 && sec('Experience', ...d.experience.map((e) => h('div', { class: 'pf-job' },
        h('div', { class: 'pf-when' }, range(e)),
        h('div', null, h('h3', null, e.role || e.company), e.role && e.company && h('p', { class: 'pf-org' }, [e.company, e.location].filter(Boolean).join(', ')),
          (e.bullets || []).length > 0 && h('ul', null, e.bullets.map((b) => h('li', null, b))))))),

      (d.projects || []).length > 0 && sec('Selected work', h('div', { class: 'pf-proj' }, d.projects.map((p) => h('article', null,
        h('h3', null, p.link ? h('a', { href: safeUrl(p.link), target: '_blank', rel: 'noopener noreferrer' }, p.name) : p.name),
        p.tech && h('p', { class: 'pf-tech' }, p.tech), p.description && h('p', null, p.description))))),

      (d.education || []).length > 0 && sec('Education', h('div', { class: 'pf-rows' }, d.education.map((e) => h('div', { class: 'pf-row' },
        h('b', null, [e.degree, e.field].filter(Boolean).join(', ') || e.school), h('span', null, range(e)), e.degree || e.field ? h('small', null, e.school) : null)))),

      (d.certifications || []).length > 0 && sec('Certifications', h('div', { class: 'pf-rows' }, d.certifications.map((c) => h('div', { class: 'pf-row' }, h('b', null, c.name), h('span', null, c.year), c.issuer && h('small', null, c.issuer))))),

      skills.length > 0 && sec('Skills', h('p', { class: 'pf-skills' }, skills.flatMap((s, i) => (i ? [h('i', null, '/'), s] : [s])))),

      (d.languages || []).length > 0 && sec('Languages', h('div', { class: 'pf-rows' }, d.languages.map((l) => h('div', { class: 'pf-row' }, h('b', null, l.name), h('span', null, l.level))))),

      (d.contact?.email || d.contact?.phone || links.length > 0) && sec('Get in touch', h('div', { class: 'pf-contact' },
        d.contact?.email && h('a', { href: 'mailto:' + d.contact.email }, d.contact.email),
        d.contact?.phone && h('a', { href: 'tel:' + d.contact.phone.replace(/[^\d+]/g, '') }, d.contact.phone),
        links.length > 0 && h('div', { class: 'pf-links' }, links.map((l) => h('a', { href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer' }, l.label))))),

      h('section', { class: 'pf-verify' },
        h('strong', null, sealed ? 'Verified document' : 'Not yet certified'),
        sealed
          ? h('p', null, `This profile is backed by a CV certified on ${longDate(d.issuedAt)}. The seal above is generated from the document ID `, h('code', null, d.docId), '. Anyone can check it was not altered.')
          : h('p', null, 'The owner has not certified this CV yet. Certified CVs carry a seal that anyone can check.'),
        sealed ? h('a', { class: 'pf-btn', href: '/verify/' + d.docId }, 'Check this document') : null)),
    h('footer', { class: 'pf-foot' }, h('span', null, 'Made with CV-Certify'), preview ? null : h('button', { class: 'pf-btn ghost', type: 'button', onclick: () => window.print() }, 'Save as PDF'))));
  return root;
}

export default async function portfolioPublic({ params }) {
  await loadPortfolioAssets();
  const d = await get('/p/' + encodeURIComponent(params.slug));
  setTitle(d.name);
  return renderPortfolio(d);
}
