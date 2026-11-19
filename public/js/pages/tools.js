import { h, icon, toast, setBusy, clear } from '../ui.js';
import { get, post } from '../api.js';
import { handleAiError } from '../editor-form.js';
import { state } from '../main.js';

const ringColor = (n) => (n >= 75 ? 'var(--brand-500)' : n >= 50 ? 'var(--gold-400)' : 'var(--red-500)');

export function scoreRing(score) {
  const r = 52, C = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.innerHTML = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="#e8ebf0" stroke-width="10"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${ringColor(score)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"/>`;
  return h('div', { class: 'ring', role: 'img', 'aria-label': `Score ${score} out of 100` }, svg, h('div', { class: 'num' }, String(score)));
}

export function atsResultView(r) {
  const verdict = r.score >= 75 ? 'Strong match' : r.score >= 50 ? 'Decent match, room to improve' : 'Weak match for this job';
  return h('div', { class: 'card stack' },
    h('div', { class: 'row', style: 'gap:24px;flex-wrap:wrap' }, scoreRing(r.score), h('div', { class: 'grow' }, h('h3', null, verdict), h('p', { class: 'muted small', style: 'margin-top:4px' }, `Keyword match ${r.keywordScore}% · Resume quality ${r.quality}%`),
      h('div', { class: 'stack-sm', style: 'margin-top:12px' }, [['Keywords', r.keywordScore], ['Contact & summary', Math.round((r.checks.contact + r.checks.summary) / 2)], ['Experience & impact', Math.round((r.checks.experience + r.checks.metrics) / 2)]].map(([l, v]) => h('div', null, h('div', { class: 'row spread small' }, h('span', null, l), h('span', { class: 'muted' }, v + '%')), h('div', { class: 'progress', role: 'presentation' }, h('i', { style: `width:${v}%;background:${ringColor(v)}` }))))))),
    r.missing.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, `Missing keywords (${r.missing.length})`), h('div', { class: 'kw' }, r.missing.map((k) => h('span', { class: 'chip chip-warn' }, k))), h('p', { class: 'hint', style: 'margin-top:6px' }, 'Only add a keyword if it truthfully describes your experience.')),
    r.matched.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, `Matched (${r.matched.length})`), h('div', { class: 'kw' }, r.matched.map((k) => h('span', { class: 'chip chip-brand' }, icon('check', 'icon-sm'), k)))),
    r.issues.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Suggestions'), h('ul', { class: 'stack-sm', style: 'list-style:none;padding:0;margin:0' }, r.issues.map((i) => h('li', { class: `alert ${i.level === 'warn' ? 'alert-warn' : 'alert-info'}`, style: 'padding:9px 12px' }, icon(i.level === 'warn' ? 'alert' : 'sparkles', 'icon-sm'), i.text)))));
}

/* ---- shared: pick a resume + job, then run a tool ---- */
async function toolShell({ title, sub, feature, runLabel, run, render }) {
  const locked = !state.user.plan.limits[feature];
  const { resumes } = await get('/resumes');
  if (locked) return upgradeCard(title, feature);
  if (!resumes.length) return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), h('p', null, sub))), h('div', { class: 'card empty' }, h('div', { class: 'icon-badge' }, icon('file')), h('h3', null, 'Create a resume first'), h('p', null, 'These tools compare a resume against a job description.'), h('a', { href: '/app/resumes', class: 'btn btn-brand', style: 'margin-top:16px' }, 'Go to resumes')));
  const sel = h('select', { class: 'select' }, resumes.map((r) => h('option', { value: r.id }, r.title)));
  const jt = h('input', { class: 'input', placeholder: 'Job title (optional)' });
  const jd = h('textarea', { class: 'textarea', rows: 9, placeholder: 'Paste the job description here…' });
  const out = h('div', { style: 'margin-top:24px' });
  const btn = h('button', { class: 'btn btn-brand', onclick: async () => {
    if (jd.value.trim().length < 40) { toast('Paste the job description first.', 'error'); return jd.focus(); }
    setBusy(btn, true, 'Working…');
    clear(out);
    try {
      const { resume } = await get('/resumes/' + sel.value);
      const res = await run({ content: resume.content, job: { title: jt.value, description: jd.value }, country: resume.country });
      out.append(render(res));
      out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { handleAiError(e); }
    setBusy(btn, false);
    btn.prepend(icon('sparkles'));
  } }, icon('sparkles'), runLabel);
  return h('div', { style: 'max-width:820px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), h('p', null, sub))),
    h('div', { class: 'card stack' }, h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Resume'), sel), h('div', { class: 'field' }, h('label', null, 'Job title'), jt), h('div', { class: 'field span-2' }, h('label', null, 'Job description'), jd)), h('div', null, btn)), out);
}

const PLAN_FOR = { ats: 'Professional', interview: 'Professional', letters: 'Professional', roadmap: 'Career+', portfolio: 'Career+' };
export function upgradeCard(title, feature) {
  return h('div', { style: 'max-width:640px' }, h('div', { class: 'page-head' }, h('h1', null, title)), h('div', { class: 'card center', style: 'padding:40px' }, h('div', { class: 'icon-badge', style: 'margin:0 auto 14px;width:52px;height:52px;background:rgba(224,184,114,.18);color:var(--gold-500)' }, icon('lock')), h('h3', null, `Available on ${PLAN_FOR[feature]}`), h('p', { class: 'muted', style: 'margin:8px 0 20px' }, `Upgrade to unlock ${title.toLowerCase()} and more.`), h('a', { href: '/app/account#plans', class: 'btn btn-brand' }, 'See plans')));
}

export const atsPage = () => toolShell({ title: 'ATS scanner', sub: 'Score a resume against a job description and see exactly what’s missing.', feature: 'ats', runLabel: 'Scan resume', run: (b) => post('/ai/ats', b), render: atsResultView });

export const interviewPage = () => toolShell({
  title: 'Interview prep', sub: 'Likely questions for this role, with tips drawn from your real experience.', feature: 'interview', runLabel: 'Generate questions', run: (b) => post('/ai/interview', b),
  render: (r) => h('div', { class: 'stack' }, r.mode === 'basic' && h('div', { class: 'alert alert-info' }, icon('sparkles'), 'Built from your profile and this job description.'),
    r.questions.map((q, i) => h('div', { class: 'card' }, h('div', { class: 'eyebrow small' }, `Question ${i + 1}`), h('h3', { style: 'margin:4px 0 8px;font-size:17px' }, q.q), h('p', { class: 'muted' }, q.tip)))),
});

export const roadmapPage = () => toolShell({
  title: 'Skill roadmap', sub: 'Turn the gaps between your resume and a job into a learning plan.', feature: 'roadmap', runLabel: 'Build roadmap', run: (b) => post('/ai/roadmap', b),
  render: (r) => h('div', { class: 'stack' }, r.steps.length === 0 ? h('div', { class: 'alert alert-info' }, icon('check'), 'No major gaps found. Your resume already covers this job’s keywords.') : r.steps.map((s, i) => h('div', { class: 'card row', style: 'align-items:flex-start' }, h('div', { class: 'icon-badge' }, String(i + 1)), h('div', { class: 'grow' }, h('div', { class: 'row spread' }, h('h3', { style: 'font-size:17px' }, s.skill), h('span', { class: 'chip chip-gold' }, `~${s.weeks} weeks`)), h('p', { class: 'muted', style: 'margin-top:6px' }, s.plan))))),
});
