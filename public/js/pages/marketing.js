import { h, icon } from '../ui.js';
import { PLANS, PLAN_ORDER, TEMPLATES, COUNTRIES, emptyContent } from '../shared/constants.js';
import { renderPaper } from '../preview.js';
import { state } from '../main.js';
import { formatPrice, isApprox } from '../shared/currency.js';

const PHRASES = ['A job for everyone.', 'An identity for everyone.'];

// Infinite typewriter. The longest phrase is rendered invisibly in the same grid cell, so the headline keeps its height while text is typed and deleted.
function typewriter() {
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

const FEATURES = [
  ['file', 'AI Resume Writer', 'Rewrites bullet points, quantifies impact, and tailors your resume to any job description in seconds.'],
  ['mail', 'Cover Letter Generator', 'Reads the job description, compares it with your profile, and writes a letter that sounds like you.'],
  ['scan', 'ATS Scanner', 'Scores your resume against a job description and tells you exactly what’s missing.'],
  ['chat', 'Interview Prep', 'Likely questions for the exact role, with tips that draw on your real experience.'],
  ['qr', 'Verifiable Document IDs', 'Every certified resume gets a unique ID and public check page recruiters can trust.'],
  ['globe', 'Country-aware Formats', 'US, UK, EU, Africa and more. Dates, referees, paper size and personal details follow local norms.'],
];

const STEPS = [
  ['Build your profile', 'Enter your experience once — education, roles, projects, skills, and more.'],
  ['Target a role', 'Paste a job description. CV-Certify extracts what actually matters.'],
  ['Generate & refine', 'AI tailors your resume and cover letter, then you edit with live AI suggestions.'],
  ['Certify & send', 'Export as PDF or DOCX with a verifiable ID recruiters can trust.'],
];

export function pricingCards() {
  const loggedIn = !!state.user;
  return h('div', { class: 'grid grid-3', style: 'align-items:stretch;max-width:960px;margin:48px auto 0' },
    PLAN_ORDER.map((id) => {
      const p = PLANS[id];
      const featured = id === 'professional';
      const current = loggedIn && state.user.plan.id === id;
      return h('div', { class: `price-card${featured ? ' featured' : ''}` },
        h('div', { class: 'tier' }, p.name),
        h('div', { class: 'price' }, p.price === 0 ? 'Free' : [formatPrice(p.price), h('small', null, '/mo'), isApprox() && h('small', { title: 'Estimated from UGX. Final billing is in UGX.', style: 'display:block;margin-top:2px' }, `≈ from UGX ${p.price.toLocaleString('en-US')}`)]),
        h('p', { class: 'muted small' }, p.tagline),
        h('ul', null, p.features.map((f) => h('li', null, icon('check'), f))),
        h('a', { href: loggedIn ? '/app/account#plans' : `/signup?plan=${id}`, class: `btn btn-outline btn-block`, 'aria-label': `${current ? 'Current plan' : 'Get started with'} ${p.name}` }, current ? 'Your current plan' : loggedIn ? 'Choose plan' : 'Get started'));
    }));
}

export function landing() {
  return h('div', null,
    h('section', { class: 'hero' }, h('div', { class: 'container fade-up' },
      h('span', { class: 'pill' }, icon('shield'), 'Verified, ATS-optimized career documents'),
      typewriter(),
      h('p', { class: 'lead' }, 'CV-Certify understands your experience, reads the room on any job description, and produces recruiter-ready resumes, cover letters, and portfolios — each one verifiable, none of it generic.'),
      h('div', { class: 'row row-wrap', style: 'justify-content:center' },
        h('a', { href: state.user ? '/app' : '/signup', class: 'btn btn-primary btn-lg' }, state.user ? 'Open dashboard' : 'Build your profile', icon('arrow')),
        h('a', { href: '#how', class: 'btn btn-outline btn-lg', onclick: (e) => { e.preventDefault(); document.getElementById('how').scrollIntoView({ behavior: 'smooth' }); } }, 'See how it works')))),
    h('div', { class: 'strip' }, h('div', { class: 'container' }, h('div', { class: 'grid grid-4' }, [
      ['ATS-first templates', 'Built to pass parsers'], ['Unique document IDs', 'Public, tamper-evident checks'], ['AI-powered writing', 'Tailored, never generic'], ['Country-aware formats', 'US, UK, EU, Africa & more'],
    ].map(([a, b]) => h('div', null, h('strong', null, a), h('span', null, b)))))),
    h('section', { class: 'section', id: 'features' }, h('div', { class: 'container' },
      h('div', { class: 'eyebrow' }, 'Platform'),
      h('h2', { style: 'max-width:640px;margin:8px 0 14px' }, 'A complete professional branding toolkit'),
      h('p', { class: 'section-sub', style: 'margin:0 0 48px' }, 'One profile. Every document you’ll ever need to apply for a job — optimized for the role, your industry, and your country.'),
      h('div', { class: 'grid grid-3' }, FEATURES.map(([ic, t, d]) => h('div', { class: 'card card-hover' }, h('div', { class: 'icon-badge', style: 'margin-bottom:18px' }, icon(ic)), h('h3', { class: 'card-title' }, t), h('p', { class: 'muted small' }, d)))))),
    h('section', { class: 'section band', id: 'how' }, h('div', { class: 'container' },
      h('h2', { class: 'center', style: 'margin-bottom:56px' }, 'From profile to offer'),
      h('div', { class: 'grid grid-4 steps' }, STEPS.map(([t, d], i) => h('div', null, h('div', { class: 'num' }, String(i + 1).padStart(2, '0')), h('h3', null, t), h('p', null, d)))))),
    h('section', { class: 'section', id: 'pricing' }, h('div', { class: 'container center' },
      h('h2', null, 'Simple, transparent pricing'),
      h('p', { class: 'section-sub', style: 'margin:14px auto 0' }, 'Start free. Upgrade when you need unlimited AI tailoring and portfolio hosting.'),
      pricingCards())),
    h('section', { class: 'section band' }, h('div', { class: 'container center', style: 'max-width:640px' },
      h('h2', null, 'Got a CV-Certify document in front of you?'),
      h('p', { class: 'section-sub', style: 'margin:14px auto 24px' }, 'Recruiters can check any document ID in seconds. No account needed.'),
      h('a', { href: '/verify', class: 'btn btn-outline btn-lg' }, icon('shield'), 'Verify a document'))));
}

const SAMPLE = () => {
  const c = emptyContent();
  c.personal = { fullName: 'Amina Okafor', headline: 'Operations Analyst', email: 'amina@example.com', phone: '+256 700 000 000', location: 'Kampala, Uganda', website: '', linkedin: '', github: '', dob: '', nationality: 'Ugandan' };
  c.summary = 'Operations analyst with 4 years of experience improving logistics workflows and reporting for fast-growing teams.';
  c.experience = [{ id: 'a', role: 'Operations Analyst', company: 'Nile Logistics', location: 'Kampala', start: '2022-03', end: '', current: true, bullets: ['Cut delivery delays by 18% by redesigning dispatch scheduling.', 'Built weekly KPI dashboards used by 6 regional managers.'] }];
  c.education = [{ id: 'b', school: 'Makerere University', degree: 'BSc', field: 'Statistics', start: '2017-08', end: '2021-06', details: '' }];
  c.skills = ['Excel', 'SQL', 'Power BI', 'Process improvement'];
  return c;
};

export function templatesPage() {
  return h('div', { class: 'container section' },
    h('div', { class: 'eyebrow' }, 'Templates'),
    h('h2', { style: 'margin:8px 0 14px' }, 'Clean layouts that pass applicant tracking systems'),
    h('p', { class: 'section-sub', style: 'margin:0 0 40px' }, 'Single-column, real text, standard headings. No tables, icons or images that parsers choke on. Pick a look; your content and country format stay the same.'),
    h('div', { class: 'grid grid-2' }, TEMPLATES.map((t) => h('div', { class: 'card' },
      h('div', { class: 'paper-wrap', style: 'margin-bottom:16px' }, renderPaper({ content: SAMPLE(), template: t.id, country: 'UK' })),
      h('div', { class: 'row spread' }, h('h3', null, t.name), h('span', { class: 'chip chip-brand' }, `ATS: ${t.ats}`)),
      h('p', { class: 'muted small', style: 'margin-top:6px' }, t.desc)))),
    h('h3', { style: 'margin:56px 0 16px' }, 'Country-aware formats'),
    h('div', { class: 'grid grid-2' }, Object.values(COUNTRIES).map((c) => h('div', { class: 'card', style: 'padding:18px' }, h('div', { class: 'row spread' }, h('strong', null, c.name), h('span', { class: 'chip' }, `${c.doc} · ${c.paper}`)), h('p', { class: 'muted small', style: 'margin-top:6px' }, c.note)))),
    h('div', { class: 'center', style: 'margin-top:48px' }, h('a', { href: state.user ? '/app/resumes' : '/signup', class: 'btn btn-primary btn-lg' }, 'Use a template', icon('arrow'))));
}
