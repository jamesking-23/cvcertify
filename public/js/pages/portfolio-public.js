import { h, icon, setTitle } from '../ui.js';
import { get } from '../api.js';
import { formatMonth } from '../shared/constants.js';
import { logo } from '../main.js';

export default async function portfolioPublic({ params }) {
  const d = await get('/p/' + encodeURIComponent(params.slug));
  setTitle(d.name);
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
  return h('div', { style: 'min-height:100vh;background:var(--ink-50)' },
    h('main', { id: 'main', class: 'container', style: 'max-width:820px;padding-top:64px;padding-bottom:80px' },
      h('header', { class: 'fade-up' }, h('h1', { style: 'font-size:clamp(36px,6vw,60px);letter-spacing:-.035em' }, d.name), d.headline && h('p', { style: 'font-size:20px;color:var(--brand-600);margin-top:8px;font-weight:500' }, d.headline), d.location && h('p', { class: 'muted', style: 'margin-top:4px' }, d.location),
        d.links.length > 0 && h('div', { class: 'row row-wrap', style: 'margin-top:20px' }, d.links.map((l) => h('a', { class: 'btn btn-outline btn-sm', href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer' }, l.label, icon('arrow', 'icon-sm'))))),
      d.about && h('section', { style: 'margin-top:40px' }, h('p', { style: 'font-size:18px;line-height:1.7;color:var(--ink-700)' }, d.about)),
      d.experience.length > 0 && h('section', { style: 'margin-top:48px' }, h('h2', { style: 'font-size:22px;margin-bottom:16px' }, 'Experience'), d.experience.map((e) => h('div', { class: 'card', style: 'margin-bottom:12px' }, h('div', { class: 'row spread row-wrap' }, h('h3', { style: 'font-size:17px' }, `${e.role}${e.company ? ' · ' + e.company : ''}`), h('span', { class: 'muted small' }, [formatMonth(e.start), e.current ? 'Present' : formatMonth(e.end)].filter(Boolean).join(' – '))), e.bullets?.length > 0 && h('ul', { style: 'margin:10px 0 0 18px;color:var(--ink-700)' }, e.bullets.map((b) => h('li', null, b)))))),
      d.projects.length > 0 && h('section', { style: 'margin-top:40px' }, h('h2', { style: 'font-size:22px;margin-bottom:16px' }, 'Projects'), h('div', { class: 'grid grid-2' }, d.projects.map((e) => h('div', { class: 'card' }, h('h3', { style: 'font-size:16px' }, e.name), e.tech && h('p', { class: 'small', style: 'color:var(--brand-600)' }, e.tech), e.description && h('p', { class: 'muted small', style: 'margin-top:6px' }, e.description))))),
      d.skills.length > 0 && h('section', { style: 'margin-top:40px' }, h('h2', { style: 'font-size:22px;margin-bottom:14px' }, 'Skills'), h('div', { class: 'kw' }, d.skills.map((s) => h('span', { class: 'chip chip-brand' }, s)))),
      h('footer', { style: 'margin-top:64px;padding-top:20px;border-top:1px solid var(--ink-100)', class: 'row spread row-wrap small muted' }, logo(), d.docId ? h('a', { href: '/verify/' + d.docId, style: 'text-decoration:underline' }, `Verified CV · ${d.docId}`) : h('span', null, 'Built with CV-Certify'))));
}
