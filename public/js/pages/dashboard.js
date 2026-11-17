import { h, icon, ago } from '../ui.js';
import { get } from '../api.js';
import { state } from '../main.js';
import { resumeToText } from '../shared/constants.js';

function completeness(c) {
  const p = c.personal;
  const checks = [
    ['Add your contact details', !!(p.fullName && p.email && p.phone)],
    ['Write a professional summary', (c.summary || '').trim().length > 30],
    ['Add work experience', c.experience.length > 0],
    ['Add achievements to your roles', c.experience.some((e) => e.bullets.length >= 2)],
    ['Add your education', c.education.length > 0],
    ['List at least 5 skills', c.skills.length >= 5],
  ];
  return { checks, pct: Math.round((checks.filter((x) => x[1]).length / checks.length) * 100) };
}

export default async function dashboard() {
  const [{ content }, { resumes }] = await Promise.all([get('/profile'), get('/resumes')]);
  const { checks, pct } = completeness(content);
  const first = state.user.name.split(' ')[0];
  const next = checks.find((c) => !c[1]);
  const certified = resumes.filter((r) => r.docId && !r.changedSinceCertified).length;

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, `Welcome, ${first}`), h('p', null, next ? 'Finish your profile to get better AI results.' : 'Your profile is in great shape. Time to target a role.')), h('a', { href: '/app/resumes', class: 'btn btn-brand' }, icon('plus'), 'New resume')),
    h('div', { class: 'grid grid-3', style: 'margin-bottom:24px' },
      h('div', { class: 'card stat' }, h('span', { class: 'muted small' }, 'Profile completeness'), h('span', { class: 'n' }, pct + '%'), h('div', { class: 'progress', role: 'presentation' }, h('i', { style: `width:${pct}%` }))),
      h('div', { class: 'card stat' }, h('span', { class: 'muted small' }, 'Resumes'), h('span', { class: 'n' }, String(resumes.length)), h('span', { class: 'muted small' }, state.user.plan.limits.resumes == null ? 'Unlimited on your plan' : `of ${state.user.plan.limits.resumes} on your plan`)),
      h('div', { class: 'card stat' }, h('span', { class: 'muted small' }, 'Certified & up to date'), h('span', { class: 'n' }, String(certified)), h('span', { class: 'muted small' }, 'With a public verification ID'))),
    h('div', { class: 'grid grid-2' },
      h('div', { class: 'card' }, h('div', { class: 'row spread', style: 'margin-bottom:8px' }, h('h3', null, 'Your checklist'), h('a', { href: '/app/profile', class: 'eyebrow small' }, 'Edit profile')),
        h('ul', { class: 'stack-sm', style: 'list-style:none;margin:0;padding:0' }, checks.map(([t, ok]) => h('li', { class: 'row', style: 'gap:10px' }, h('span', { class: 'icon-badge', style: `width:24px;height:24px;border-radius:50%;${ok ? '' : 'background:var(--ink-100);color:var(--ink-400)'}` }, ok ? icon('check', 'icon-sm') : null), h('span', { style: ok ? 'color:var(--ink-400);text-decoration:line-through' : 'font-weight:500' }, t))))),
      h('div', { class: 'card' }, h('div', { class: 'row spread', style: 'margin-bottom:8px' }, h('h3', null, 'Recent resumes'), h('a', { href: '/app/resumes', class: 'eyebrow small' }, 'View all')),
        resumes.length ? h('div', { class: 'list' }, resumes.slice(0, 4).map((r) => h('a', { href: '/app/resumes/' + r.id, class: 'list-item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'muted small' }, `edited ${ago(r.updatedAt)}`)), r.docId && h('span', { class: 'chip chip-brand' }, icon('shield', 'icon-sm'), 'Certified'))))
          : h('p', { class: 'muted' }, 'No resumes yet. Create one from your profile in two clicks.'))));
}
