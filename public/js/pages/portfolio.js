import { h, icon, toast, setBusy, copyText, clear } from '../ui.js';
import { get, put } from '../api.js';
import { upgradeCard } from './tools.js';
import { state } from '../main.js';

export default async function portfolioPage() {
  if (!state.user.plan.limits.portfolio) return upgradeCard('Portfolio', 'portfolio');
  const [{ portfolio: p }, { resumes }] = await Promise.all([get('/portfolio'), get('/resumes')]);
  const enabled = h('input', { type: 'checkbox', checked: p.enabled });
  const slug = h('input', { class: 'input', value: p.slug || '', placeholder: 'your-name', autocapitalize: 'none', spellcheck: 'false' });
  const headline = h('input', { class: 'input', value: p.headline || '', placeholder: 'Defaults to your resume headline' });
  const about = h('textarea', { class: 'textarea', rows: 4, placeholder: 'Defaults to your resume summary' });
  about.value = p.about || '';
  const rs = h('select', { class: 'select' }, h('option', { value: '' }, 'Master profile'), resumes.map((r) => h('option', { value: r.id, selected: r.id === p.resumeId }, r.title)));
  const links = (p.links || []).map((l) => ({ ...l }));
  const linkHost = h('div', { class: 'stack-sm' });
  const drawLinks = () => {
    clear(linkHost);
    links.forEach((l, i) => linkHost.append(h('div', { class: 'row' }, h('input', { class: 'input', placeholder: 'Label', value: l.label, style: 'max-width:160px', oninput: (e) => (l.label = e.target.value) }), h('input', { class: 'input grow', placeholder: 'https://…', value: l.url, oninput: (e) => (l.url = e.target.value) }), h('button', { class: 'icon-btn danger', 'aria-label': 'Remove link', onclick: () => { links.splice(i, 1); drawLinks(); } }, icon('trash', 'icon-sm')))));
    if (links.length < 8) linkHost.append(h('button', { class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: () => { links.push({ label: '', url: '' }); drawLinks(); } }, icon('plus', 'icon-sm'), 'Add link'));
  };
  drawLinks();
  const url = () => `${location.origin}/p/${slug.value.trim().toLowerCase()}`;
  const preview = h('div', { class: 'row small muted' });
  const showUrl = () => { clear(preview).append(icon('globe', 'icon-sm'), url()); };
  slug.addEventListener('input', showUrl);
  showUrl();

  const save = h('button', { class: 'btn btn-brand', onclick: async () => {
    setBusy(save, true, 'Saving…');
    try {
      const out = await put('/portfolio', { enabled: enabled.checked, slug: slug.value, headline: headline.value, about: about.value, links: links.filter((l) => l.label && l.url), resumeId: rs.value || null });
      slug.value = out.portfolio.slug;
      showUrl();
      toast(out.portfolio.enabled ? 'Portfolio published.' : 'Portfolio saved (not public).');
    } catch (e) { toast(e.message, 'error'); }
    setBusy(save, false);
  } }, 'Save portfolio');

  return h('div', { style: 'max-width:720px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Portfolio'), h('p', null, 'A shareable web page built from your resume.'))),
    h('div', { class: 'card stack' },
      h('label', { class: 'check' }, enabled, h('strong', null, 'Publish my portfolio')),
      h('div', { class: 'field' }, h('label', null, 'Web address'), slug, preview, h('span', { class: 'hint' }, 'Custom domains are not available yet. Your page lives under this address.')),
      h('div', { class: 'field' }, h('label', null, 'Content from'), rs), h('div', { class: 'field' }, h('label', null, 'Headline'), headline), h('div', { class: 'field' }, h('label', null, 'About'), about),
      h('div', { class: 'field' }, h('label', null, 'Links'), linkHost),
      h('div', { class: 'row' }, save, p.enabled && p.slug && h('a', { class: 'btn btn-outline', href: '/p/' + p.slug, target: '_blank', rel: 'noopener' }, 'View page'), p.enabled && p.slug && h('button', { class: 'btn btn-ghost', onclick: () => copyText(url()) }, icon('copy'), 'Copy link'))));
}
