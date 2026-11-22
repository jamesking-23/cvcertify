import { h, icon, ago } from '../ui.js';
import { get } from '../api.js';
import { state } from '../main.js';
import { resumeToText } from '../shared/constants.js';

function completeness(c) {
  const p = c.personal;
  const checks = [
    ['Add your contact details', !!(p.fullName && p.email && p.phone), '/app/profile'],
    ['Write a professional summary', (c.summary || '').trim().length > 30, '/app/profile'],
    ['Add work experience', c.experience.length > 0, '/app/profile'],
    ['Add achievements to your roles', c.experience.some((e) => e.bullets.length >= 2), '/app/profile'],
    ['Add your education', c.education.length > 0, '/app/profile'],
    ['List at least 5 skills', c.skills.length >= 5, '/app/profile'],
  ];
  return { checks, pct: Math.round((checks.filter((x) => x[1]).length / checks.length) * 100) };
}

const TOOLS = [
  ['/app/assistant', 'chat', 'AI assistant', 'Ask anything about your CV or job search.'],
  ['/app/letters', 'mail', 'Cover letters', 'Written from your real experience.'],
  ['/app/ats', 'scan', 'ATS scanner', 'See how a job description scores your CV.'],
  ['/app/interview', 'target', 'Interview prep', 'Likely questions with tips from your CV.'],
  ['/app/portfolio', 'globe', 'Portfolio', 'A page of your own with a verified seal.'],
];

function ring(pct) {
  const r = 46, c = 2 * Math.PI * r;
  const wrap = h('div', { class: 'ring', role: 'img', 'aria-label': `Profile ${pct}% complete` });
  wrap.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="ring-bg"/><circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 60 60)"/></svg><b>${pct}<small>%</small></b>`;
  return wrap;
}

export default async function dashboard() {
  const [{ content }, { resumes }] = await Promise.all([get('/profile'), get('/resumes')]);
  const { checks: profileChecks, pct } = completeness(content);
  const checks = [...profileChecks, ['Create your first resume', resumes.length > 0, '/app/resumes'], ['Certify a resume to get a public verification ID', resumes.some((r) => r.docId), '/app/resumes']];
  const first = state.user.name.split(' ')[0];
  const next = checks.find((c) => !c[1]);
  const certified = resumes.filter((r) => r.docId && !r.changedSinceCertified).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return h('div', { class: 'dash' },
    h('section', { class: 'dash-hero' },
      h('div', { class: 'dash-hero-text' },
        h('h1', null, `${greet}, ${first}`),
        h('p', null, next ? `Next step: ${next[0].charAt(0).toLowerCase() + next[0].slice(1)}.` : 'Your profile is complete. Pick a job and tailor your CV to it.'),
        h('div', { class: 'row row-wrap', style: 'margin-top:18px' },
          h('a', { href: next ? next[2] : '/app/resumes', class: 'btn btn-brand' }, next ? 'Continue' : icon('plus'), next ? null : 'New resume'),
          next && resumes.length === 0 ? null : h('a', { href: '/app/resumes', class: 'btn btn-outline-light' }, `${resumes.length} resume${resumes.length === 1 ? '' : 's'} · ${certified} certified`))),
      ring(pct)),
    h('section', { class: 'tiles', 'aria-label': 'Tools' }, TOOLS.map(([href, ic, t, d]) => h('a', { class: 'tile', href }, icon(ic), h('strong', null, t), h('span', null, d)))),
    h('div', { class: 'grid grid-2', style: 'margin-top:24px' },
      h('div', { class: 'card' }, h('div', { class: 'row spread', style: 'margin-bottom:10px' }, h('h3', null, 'Your checklist'), h('a', { href: '/app/profile', class: 'small', style: 'color:var(--brand-600);font-weight:600' }, 'Edit profile')),
        h('ul', { class: 'stack-sm', style: 'list-style:none;margin:0;padding:0' }, checks.map(([t, ok, to]) => h('li', { class: 'row', style: 'gap:10px' }, h('span', { class: 'icon-badge', style: `width:24px;height:24px;border-radius:50%;flex:none;${ok ? '' : 'background:var(--ink-100);color:var(--ink-400)'}` }, ok ? icon('check', 'icon-sm') : null), ok ? h('span', { style: 'color:var(--ink-400);text-decoration:line-through' }, t) : h('a', { href: to, style: 'font-weight:500' }, t))))),
      h('div', { class: 'card' }, h('div', { class: 'row spread', style: 'margin-bottom:10px' }, h('h3', null, 'Recent resumes'), h('a', { href: '/app/resumes', class: 'small', style: 'color:var(--brand-600);font-weight:600' }, 'View all')),
        resumes.length ? h('div', { class: 'list' }, resumes.slice(0, 4).map((r) => h('a', { href: '/app/resumes/' + r.id, class: 'list-item' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'muted small' }, `Edited ${ago(r.updatedAt)}`)), r.docId && h('span', { class: 'chip chip-brand' }, icon('shield', 'icon-sm'), 'Certified'))))
          : h('div', { class: 'empty-note' }, h('p', null, 'Your first resume takes about two minutes. It starts from your profile, so there is nothing to retype.'), h('a', { href: '/app/resumes', class: 'btn btn-brand btn-sm' }, icon('plus', 'icon-sm'), 'Create a resume')))));
}
