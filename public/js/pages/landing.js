// Landing page. Everything on it is built from the same renderers the product uses (renderPaper, renderLetter),
// so what visitors see is what they will get.
import { h, icon, clear } from '../ui.js';
import { state, navigate } from '../main.js';
import { TEMPLATES, COUNTRIES, LETTER_FORMATS } from '../shared/constants.js';
import { renderPaper, renderLetter } from '../preview.js';
import { typewriter } from './marketing.js';
import { sampleContent, SAMPLE_ID, SAMPLE_LETTER, SAMPLE_JOB } from './sample.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- small helpers ---------- */
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); e.target.dispatchEvent(new CustomEvent('reveal')); io.unobserve(e.target); } }), { threshold: 0.18 })
  : null;
function reveal(el, delay = 0) {
  el.setAttribute('data-reveal', '');
  if (delay) el.style.setProperty('--d', delay + 'ms');
  if (io && !reduced()) io.observe(el);
  else el.classList.add('in');
  return el;
}
function countUp(el, to) {
  el.textContent = String(to);
  if (reduced()) return;
  el.textContent = '0';
  el.closest('[data-reveal]')?.addEventListener('reveal', () => {
    const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / 900); el.textContent = String(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, { once: true });
}
let stampN = 0;
function stamp(cls = '') {
  const id = 'sp' + ++stampN;
  const el = h('div', { class: `stamp ${cls}`, 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 120 120"><defs><path id="${id}" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs><circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="60" cy="60" r="36" fill="none" stroke="currentColor" stroke-width="1.2"/><text font-size="9.6" font-weight="700" letter-spacing="2.4" fill="currentColor"><textPath href="#${id}" startOffset="0">CERTIFIED · CV-CERTIFY · VERIFIABLE ·</textPath></text><path d="M44 61l11 11 21-24" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return el;
}
const cta = (label = 'Build your profile', cls = 'btn-lp') => h('a', { href: state.user ? '/app' : '/signup', class: `btn ${cls}` }, state.user ? 'Open your dashboard' : label, icon('arrow'));

/* ---------- hero: a real document that changes layout on request ---------- */
function hero() {
  const content = sampleContent();
  const host = h('div', { class: 'desk-paper' });
  let current = 0;
  let timer = null;
  const chips = TEMPLATES.map((t, i) => h('button', { type: 'button', class: 'chip-lp', 'aria-pressed': i === 0, onclick: () => { stop(); show(i); } }, t.name));
  const show = (i) => {
    current = i;
    host.classList.add('swap');
    setTimeout(() => {
      clear(host).append(renderPaper({ content, template: TEMPLATES[i].id, country: 'AF', docId: SAMPLE_ID, verifyUrl: 'verify.cvcertify.app/' + SAMPLE_ID }));
      host.classList.remove('swap');
    }, host.childNodes.length ? 160 : 0);
    chips.forEach((c, k) => c.setAttribute('aria-pressed', k === i));
    caption.textContent = TEMPLATES[i].desc;
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const caption = h('p', { class: 'desk-cap' });
  show(0);
  if (!reduced()) timer = setInterval(() => (host.isConnected ? show((current + 1) % TEMPLATES.length) : stop()), 5200);

  const idLine = h('div', { class: 'idline' }, h('span', null, 'Sample ID'), h('b', null, SAMPLE_ID));
  return h('div', { class: 'desk' },
    h('div', { class: 'desk-sheet' }, host, stamp('stamp-hero')),
    idLine,
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Resume layout' }, chips),
    caption);
}

function heroSection() {
  return h('section', { class: 'lp-hero' }, h('div', { class: 'lp-wrap hero-grid' },
    h('div', { class: 'hero-copy' },
      h('div', { class: 'kicker' }, 'Resumes, cover letters and a way to prove they’re yours'),
      typewriter(),
      h('p', { class: 'lead' }, 'Write your experience once. CV-Certify shapes it into a resume and cover letter for each job, in the format employers in that country expect, then stamps the finished document with an ID anyone can check.'),
      h('div', { class: 'row row-wrap', style: 'gap:18px;align-items:center' }, cta('Build your profile, free'), h('a', { href: '/verify', class: 'textlink' }, 'Check a document ID', icon('arrow'))),
      h('p', { class: 'fineprint' }, 'Free for everyone. No card needed.')),
    hero()));
}

/* ---------- numbers that are true of the product ---------- */
function facts() {
  const items = [[TEMPLATES.length, 'resume layouts'], [Object.keys(COUNTRIES).length, 'country formats'], [LETTER_FORMATS.length, 'cover letter layouts'], [1, 'ID per document, checkable by anyone']];
  return h('section', { class: 'lp-facts' }, h('div', { class: 'lp-wrap facts-row' }, items.map(([n, label], i) => {
    const num = h('span', { class: 'big' });
    const cell = reveal(h('div', null, num, h('span', { class: 'lbl' }, label)), i * 90);
    countUp(num, n);
    return cell;
  })));
}

/* ---------- how it works: one story, four stages ---------- */
function story() {
  const stage = h('div', { class: 'stage', 'aria-live': 'polite' });
  const kw = (t, hit) => h('mark', { class: hit ? 'hit' : 'miss' }, t);
  const visuals = [
    // 1. profile
    () => h('div', { class: 'vis vis-profile' },
      h('div', { class: 'vlabel' }, 'Your master profile'),
      [['Operations Analyst', 'Nile Logistics · 2022 – now'], ['Operations Assistant', 'Lake Freight Ltd · 2020 – 2022'], ['BSc Statistics', 'Makerere University · 2021']].map(([a, b], i) => h('div', { class: 'vrow', style: `--i:${i}` }, h('div', null, h('b', null, a), h('span', null, b)), h('span', { class: 'saved' }, icon('check', 'icon-sm'), 'saved'))),
      h('p', { class: 'vnote' }, 'Typed once. Every resume and letter starts from this and can be edited without touching the original.')),
    // 2. target
    () => h('div', { class: 'vis vis-target' },
      h('div', { class: 'vlabel' }, 'Job description (example)'),
      h('p', { class: 'jd' }, 'We need an analyst who can build ', kw('dashboards', true), ' in ', kw('Power BI', true), ', write ', kw('SQL', true), ' queries and run ', kw('stakeholder', false), ' reporting for regional teams. ', kw('Forecasting', false), ' is a plus.'),
      h('div', { class: 'ring-row' }, h('div', { class: 'ring', style: '--v:78' }, h('b', null, '78'), h('span', null, 'match')), h('div', null, h('p', { class: 'vnote', style: 'margin:0' }, 'Three of five keywords already appear in the resume. The two missing ones are flagged so you can add them only if they’re true.')))),
    // 3. write
    () => h('div', { class: 'vis vis-write' },
      h('div', { class: 'vlabel' }, 'Rewrite a bullet'),
      h('div', { class: 'before' }, h('span', null, 'Before'), 'Responsible for dispatch scheduling and helped reduce delays.'),
      h('div', { class: 'after' }, h('span', null, 'After'), 'Cut delivery delays by 18% by redesigning dispatch scheduling.'),
      h('p', { class: 'vnote' }, 'It tightens your wording. It does not invent employers, dates or numbers, and it says so when your numbers are missing.')),
    // 4. certify
    () => certifyDemo(),
  ];
  const steps = [['Put your career in once', 'Roles, education, skills, referees. One master profile that you edit in one place.'], ['Point it at a job', 'Paste the description. See which keywords you cover and which you don’t.'], ['Write it for that role', 'Tighten bullets, draft a summary, generate a cover letter. You edit every word.'], ['Certify and send', 'Export to Word or PDF. The ID goes on the page, and the check page goes with it.']];
  let active = 0;
  let timer = null;
  let touched = false;
  const buttons = steps.map(([t, d], i) => h('button', { type: 'button', class: 'step', 'aria-current': i === 0, onclick: () => { touched = true; go(i); } },
    h('span', { class: 'n' }, String(i + 1).padStart(2, '0')), h('span', null, h('b', null, t), h('small', null, d)), h('i', { class: 'bar' })));
  const go = (i) => {
    active = i;
    buttons.forEach((b, k) => { b.setAttribute('aria-current', k === i); b.classList.toggle('done', k < i); });
    clear(stage).append(visuals[i]());
    stage.classList.remove('pop'); void stage.offsetWidth; stage.classList.add('pop');
  };
  go(0);
  const root = h('section', { class: 'lp-sec', id: 'how' }, h('div', { class: 'lp-wrap' },
    reveal(h('h2', null, 'From a blank page to a document you can send with confidence')),
    h('div', { class: 'story' }, h('div', { class: 'steps-col' }, buttons), reveal(stage, 120))));
  stage.addEventListener('reveal', () => {
    if (reduced()) return;
    timer = setInterval(() => { if (!root.isConnected) return clearInterval(timer); if (!touched) go((active + 1) % steps.length); }, 6500);
  }, { once: true });
  return root;
}

function certifyDemo() {
  let changed = false;
  const pill = h('span', { class: 'pill-lp ok' });
  const note = h('p', { class: 'vnote' });
  const btn = h('button', { type: 'button', class: 'btn-ghost-lp', onclick: () => { changed = !changed; paint(); } });
  const line = h('p', { class: 'resume-line' });
  const st = stamp('stamp-demo');
  const paint = () => {
    st.classList.toggle('void', changed);
    line.replaceChildren('Cut delivery delays by ', h('b', { class: changed ? 'edit' : '' }, changed ? '48%' : '18%'), ' by redesigning dispatch scheduling.');
    pill.className = `pill-lp ${changed ? 'warn' : 'ok'}`;
    pill.replaceChildren(icon(changed ? 'alert' : 'shield', 'icon-sm'), changed ? 'Edited since it was certified' : 'Valid · unchanged since issue');
    note.textContent = changed ? 'One number changed and the check page now says so. To fix it you certify again, and the old version stays on record.' : 'This is what a recruiter sees when they enter the ID. Try changing the number.';
    btn.textContent = changed ? 'Undo the edit' : 'Change 18% to 48%';
  };
  paint();
  return h('div', { class: 'vis vis-cert' },
    h('div', { class: 'vlabel' }, 'Certify, then check'),
    h('div', { class: 'cert-card' }, st, h('div', { class: 'cid' }, h('span', null, 'Document ID'), h('b', null, SAMPLE_ID)), line, pill),
    note, btn);
}

/* ---------- countries ---------- */
function countries() {
  const content = sampleContent();
  const paperHost = h('div', { class: 'country-paper' });
  const facts = h('dl', { class: 'cfacts' });
  const note = h('p', { class: 'cnote' });
  const list = Object.values(COUNTRIES);
  const chips = list.map((c) => h('button', { type: 'button', class: 'chip-lp', onclick: () => pick(c.id) }, c.name.replace(/ \(.*\)/, '').replace('Africa', 'Africa')));
  const yn = (v) => (v ? 'Included' : 'Left out');
  const pick = (id) => {
    const c = COUNTRIES[id];
    chips.forEach((b, i) => b.setAttribute('aria-pressed', list[i].id === id));
    clear(paperHost).append(renderPaper({ content, template: 'classic', country: id }));
    clear(facts).append(...[['Called a', c.doc], ['Paper', c.paper], ['Date of birth', yn(c.dob)], ['Nationality', yn(c.nationality)], ['Referees', yn(c.referees)]].flatMap(([k, v]) => [h('dt', null, k), h('dd', { class: /Included/.test(v) ? 'yes' : '' }, v)]));
    note.textContent = c.note;
  };
  pick('AF');
  return h('section', { class: 'lp-sec lp-sec-alt', id: 'features' }, h('div', { class: 'lp-wrap country-grid' },
    reveal(h('div', { class: 'country-copy' },
      h('h2', null, 'The same career, written for where you’re applying'),
      h('p', { class: 'lp-sub' }, 'A Kampala employer expects a date of birth and two referees. A London one doesn’t want the date of birth at all. Switch the country and the document follows the local rules.'),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Country' }, chips), facts, note)),
    reveal(h('div', { class: 'country-sheet' }, paperHost), 140)));
}

/* ---------- the shelf of layouts ---------- */
function shelf() {
  const content = sampleContent();
  const items = [
    ...TEMPLATES.map((t) => ({ kind: 'Resume', name: t.name, desc: t.desc, node: () => renderPaper({ content, template: t.id, country: 'UK' }) })),
    ...LETTER_FORMATS.map((f) => ({ kind: 'Cover letter', name: f.name, desc: f.desc, node: () => renderLetter({ text: SAMPLE_LETTER, personal: content.personal, job: SAMPLE_JOB, format: f.id, date: new Date(2026, 10, 19) }) })),
  ];
  const track = h('div', { class: 'shelf-track', tabindex: '0', role: 'list', 'aria-label': 'Resume and cover letter layouts' }, items.map((it) => h('figure', { class: 'shelf-item', role: 'listitem' }, h('div', { class: 'shelf-paper' }, it.node()), h('figcaption', null, h('span', { class: 'k' }, it.kind), h('b', null, it.name), h('small', null, it.desc)))));
  const scrollBy = (d) => track.scrollBy({ left: d * 320, behavior: reduced() ? 'auto' : 'smooth' });
  return h('section', { class: 'lp-sec lp-shelf' }, h('div', { class: 'lp-wrap' },
    h('div', { class: 'shelf-head' }, reveal(h('div', null, h('h2', null, 'Ten layouts, all built from the same data'), h('p', { class: 'lp-sub' }, 'Switch layouts any time. Your words stay put. Plain single-column ones are the safest for software that reads resumes; the table and side-rail layouts read well to people.'))),
      h('div', { class: 'arrows' }, h('button', { type: 'button', 'aria-label': 'Previous layouts', class: 'circ', onclick: () => scrollBy(-1) }, icon('arrow')), h('button', { type: 'button', 'aria-label': 'Next layouts', class: 'circ', onclick: () => scrollBy(1) }, icon('arrow')))),
    ), track);
}

/* ---------- for recruiters ---------- */
function recruiters() {
  const input = h('input', { class: 'vinput', placeholder: 'CVC-XXXX-XXXX-XXXX', value: '', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Document ID' });
  const form = h('form', { class: 'vform', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); navigate(v ? '/verify/' + encodeURIComponent(v) : '/verify'); } }, input, h('button', { class: 'btn btn-lp-light', type: 'submit' }, 'Check'));
  return h('section', { class: 'lp-sec lp-dark' }, h('div', { class: 'lp-wrap recruiter-grid' },
    reveal(h('div', null, h('div', { class: 'kicker light' }, 'For recruiters and hiring managers'), h('h2', null, 'Got a CV-Certify document? Check it in ten seconds.'), h('p', { class: 'lp-sub' }, 'Type the ID printed at the bottom of the page. No account, no email.'), form)),
    reveal(h('div', { class: 'truth' },
      h('div', null, h('b', null, 'What the check confirms'), h('p', null, 'The document was issued from that account, and its content hasn’t changed since. Edits are flagged, and revoked IDs say so.')),
      h('div', null, h('b', null, 'What it doesn’t'), h('p', null, 'It doesn’t independently verify employers, degrees or references. Treat it as proof of integrity, not a background check.'))), 140)));
}

/* ---------- free for everyone ---------- */
function freeBand() {
  return h('section', { class: 'lp-sec', id: 'free' }, h('div', { class: 'lp-wrap center' },
    reveal(h('h2', null, 'Free. All of it.')),
    reveal(h('p', { class: 'lp-sub', style: 'margin:12px auto 0' }, 'Unlimited resumes, every template, cover letters, the ATS scanner, interview prep, skill roadmaps, a public portfolio and document verification. No card, no trial, no paid tier.'), 80),
    reveal(h('div', { style: 'margin-top:28px' }, cta('Build your profile, free')), 140)));
}

/* ---------- questions ---------- */
const QA = [
  ['Does the AI make things up?', 'It’s instructed not to invent employers, titles, dates, qualifications or numbers, and it works from your profile. If you don’t have a figure for a bullet, it won’t supply one. Read everything before you send it. You’re the one signing it.'],
  ['What does the document ID prove?', 'That the document was issued from your account and hasn’t been changed since. If you edit it, the check page says it changed. If you revoke it, the page says that too. It doesn’t vouch for your employers or degrees.'],
  ['Will applicant tracking systems read it?', 'The layouts use real text, not images. The single-column ones (Classic, Modern, Compact, Executive, Timeline) are the safest. Academic uses tables and Rail uses a side column, which most parsers handle but a few don’t, so use Classic when a portal is picky.'],
  ['Which countries are covered?', 'Eight formats: US, Canada, UK, EU, Africa, Australia and New Zealand, India, and the Middle East. They change the document’s name, paper size, and whether date of birth, nationality and referees appear.'],
  ['Can I get a Word file or a PDF?', 'Both. Word downloads directly. For PDF, use Print and choose Save as PDF. The ID is on the page either way.'],
  ['What happens to my data?', 'It’s stored in a database where each account can read only its own rows. You can delete everything from the Account page, and every ID you issued is revoked at the same time.'],
];
function faq() {
  return h('section', { class: 'lp-sec lp-sec-alt' }, h('div', { class: 'lp-wrap faq-grid' },
    reveal(h('h2', null, 'Straight answers')),
    h('div', { class: 'faq' }, QA.map(([q, a], i) => reveal(h('details', null, h('summary', null, q, h('i', { 'aria-hidden': 'true' })), h('p', null, a)), i * 50)))));
}

function closing() {
  return h('section', { class: 'lp-close' }, h('div', { class: 'lp-wrap center' },
    reveal(h('h2', null, 'Your next application, ready to check.')),
    reveal(h('div', { style: 'margin-top:28px' }, cta('Build your profile, free', 'btn-lp btn-lg')), 100)));
}

export function landing() {
  document.body.classList.add('lp-body');
  return h('div', { class: 'lp' }, heroSection(), facts(), story(), countries(), shelf(), recruiters(), freeBand(), faq(), closing());
}
