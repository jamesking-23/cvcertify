// Renders documents as styled "paper" elements. Shared by the editor preview, print/PDF, the landing page and public views.
// Resume templates: classic / modern / compact / executive share one flow; academic, timeline and rail have their own layouts.
import { h, icon } from './ui.js';
import { COUNTRIES, dateRange } from './shared/constants.js';

// Dates of birth are stored as YYYY-MM-DD (from the date picker) and shown as "14 March 1998". Older free-text values pass through.
const prettyDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return v || '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const years = (e) => { const a = (e.start || '').slice(0, 4), b = e.current ? 'Present' : (e.end || '').slice(0, 4); return a && b && a !== b ? `${a} – ${b}` : a || b || ''; };
const eduTitle = (e) => `${e.degree || ''}${e.field ? ' in ' + e.field : ''}`;
const certLine = (e) => `${e.name}${e.issuer ? ' – ' + e.issuer : ''}${e.year ? ' (' + e.year + ')' : ''}`;
const langLine = (l) => `${l.name}${l.level ? ' (' + l.level + ')' : ''}`;
const refLine = (r) => `${r.name}${r.title ? ', ' + r.title : ''}${r.contact ? ' – ' + r.contact : ''}`;

export function renderPaper({ content: c, template = 'classic', country = 'US', docId = null, verifyUrl = '', stale = false }) {
  const p = c.personal || {};
  const rules = COUNTRIES[country] || COUNTRIES.US;
  const sec = (title, ...kids) => [h('h2', null, title), ...kids];
  const row = (l, r) => h('div', { class: 'r' }, h('span', null, l), h('span', null, r || ''));
  const contactBits = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean);
  const contact = contactBits.join('  ·  ');
  const showPersonal = !!c.options?.showPersonal;
  const personalBits = [showPersonal && p.dob ? `Date of birth: ${prettyDate(p.dob)}` : '', showPersonal && p.nationality ? `Nationality: ${p.nationality}` : ''].filter(Boolean);
  const personal = personalBits.join('  ·  ');
  const showRefs = rules.referees && c.referees?.length > 0;
  const bullets = (e) => e.bullets?.length > 0 && h('ul', null, e.bullets.map((b) => h('li', null, b)));
  const verified = docId && !stale && h('div', { class: 'verified' }, h('span', null, icon('shield'), ' Verified by CV-Certify · ID ', h('b', null, docId)), h('span', null, verifyUrl.replace(/^https?:\/\//, '')));
  const cls = `paper t-${template} ${rules.paper === 'Letter' ? 'letter' : ''}`;
  const label = { 'aria-label': `${rules.doc} preview` };

  /* ---------- academic: shaded header, ruled sections, bordered tables ---------- */
  if (template === 'academic') {
    const exp = c.experience || [];
    const interns = exp.length > 0 && exp.every((e) => /intern|trainee|attach/i.test(e.role || ''));
    return h('article', { class: cls, ...label },
      h('header', { class: 'a-head' }, h('h1', null, p.fullName || 'Your Name'), p.headline && h('div', { class: 'headline' }, p.headline), contactBits.length > 0 && h('div', { class: 'contact' }, contact), p.registration && h('div', { class: 'contact' }, p.registration), personalBits.length > 0 && h('div', { class: 'contact' }, personal)),
      c.summary && sec('Professional profile', h('p', null, c.summary)),
      c.education?.length > 0 && sec('Academic qualifications', h('table', { class: 'q' }, h('tbody', null, c.education.map((e) => h('tr', null, h('td', null, h('b', null, eduTitle(e) || e.school), e.details && h('div', { class: 'sub' }, e.details)), h('td', null, [e.school, years(e)].filter(Boolean).join(', '))))))),
      c.certifications?.length > 0 && sec('Professional membership and certification', c.certifications.map((e) => h('p', null, certLine(e)))),
      exp.length > 1 && sec(interns ? 'Internship overview' : 'Experience overview', h('table', { class: 'ov' }, h('thead', null, h('tr', null, h('th', null, 'Period'), h('th', null, 'Role'), h('th', null, 'Organisation / Location'))), h('tbody', null, exp.map((e) => h('tr', null, h('td', null, dateRange(e)), h('td', null, e.role), h('td', null, [e.company, e.location].filter(Boolean).join(', '))))))),
      exp.length > 0 && sec(interns ? 'Internship experience' : 'Work experience', exp.map((e) => h('div', { class: 'item' }, h('div', { class: 'ttl' }, h('b', null, e.role || ''), e.company && h('b', null, ` — ${e.company}`)), h('div', { class: 'sub' }, [e.location, dateRange(e)].filter(Boolean).join('  |  ')), bullets(e)))),
      c.projects?.length > 0 && sec('Projects', c.projects.map((e) => h('div', { class: 'item' }, h('div', { class: 'ttl' }, h('b', null, e.name), e.tech && h('span', null, ` — ${e.tech}`)), e.description && h('div', null, e.description)))),
      c.skills?.length > 0 && sec('Skills', h('ul', { class: 'cols' }, c.skills.map((s) => h('li', null, s)))),
      c.languages?.length > 0 && sec('Languages', c.languages.map((l) => h('div', null, langLine(l)))),
      showRefs && sec('Referees', h('div', { class: 'two' }, c.referees.map((r) => h('div', null, h('div', null, r.name), r.title && h('div', null, r.title), r.contact && h('div', null, r.contact))))),
      h('p', { class: 'fine' }, c.footnote || 'Supporting documents are available upon request.'),
      verified);
  }

  /* ---------- timeline: dates in the margin ---------- */
  if (template === 'timeline') {
    const line = (date, ...kids) => h('div', { class: 'tl' }, h('div', { class: 'when' }, date || ''), h('div', { class: 'what' }, ...kids));
    return h('article', { class: cls, ...label },
      h('header', { class: 'tl-head' }, h('div', null, h('h1', null, p.fullName || 'Your Name'), p.headline && h('div', { class: 'headline' }, p.headline)), h('div', { class: 'contact' }, [...contactBits, ...personalBits].map((b) => h('div', null, b)))),
      c.summary && sec('Profile', line('', h('p', null, c.summary))),
      c.experience?.length > 0 && sec('Experience', c.experience.map((e) => line(dateRange(e), h('b', null, e.role || ''), h('div', { class: 'sub' }, [e.company, e.location].filter(Boolean).join(', ')), bullets(e)))),
      c.education?.length > 0 && sec('Education', c.education.map((e) => line(dateRange(e), h('b', null, eduTitle(e) || e.school), h('div', { class: 'sub' }, e.school), e.details && h('div', null, e.details)))),
      c.projects?.length > 0 && sec('Projects', c.projects.map((e) => line('', h('b', null, e.name), e.tech && h('div', { class: 'sub' }, e.tech), e.description && h('div', null, e.description)))),
      c.skills?.length > 0 && sec('Skills', line('', c.skills.join(' · '))),
      c.certifications?.length > 0 && sec('Certifications', c.certifications.map((e) => line(e.year, certLine({ ...e, year: '' })))),
      c.languages?.length > 0 && sec('Languages', line('', c.languages.map(langLine).join(' · '))),
      showRefs && sec('Referees', c.referees.map((r) => line('', refLine(r)))),
      c.footnote && h('p', { class: 'fine' }, c.footnote),
      verified);
  }

  /* ---------- rail: side column + main story ---------- */
  if (template === 'rail') {
    const rail = (title, ...kids) => [h('h3', null, title), ...kids];
    return h('article', { class: cls, ...label },
      h('div', { class: 'cols2' },
        h('aside', { class: 'rail' },
          ...rail('Contact', contactBits.map((b) => h('div', { class: 'bit' }, b)), personalBits.map((b) => h('div', { class: 'bit' }, b))),
          c.skills?.length > 0 && rail('Skills', c.skills.map((s) => h('div', { class: 'bit' }, s))),
          c.languages?.length > 0 && rail('Languages', c.languages.map((l) => h('div', { class: 'bit' }, langLine(l)))),
          c.certifications?.length > 0 && rail('Certifications', c.certifications.map((e) => h('div', { class: 'bit' }, certLine(e)))),
          showRefs && rail('Referees', c.referees.map((r) => h('div', { class: 'bit' }, refLine(r))))),
        h('div', { class: 'main' },
          h('h1', null, p.fullName || 'Your Name'), p.headline && h('div', { class: 'headline' }, p.headline),
          c.summary && sec('Profile', h('p', null, c.summary)),
          c.experience?.length > 0 && sec('Experience', c.experience.map((e) => h('div', null, row(`${e.role || ''}${e.company ? ', ' + e.company : ''}`, dateRange(e)), e.location && h('div', { class: 'sub' }, e.location), bullets(e)))),
          c.education?.length > 0 && sec('Education', c.education.map((e) => h('div', null, row(`${eduTitle(e)}${e.school ? ', ' + e.school : ''}`, dateRange(e)), e.details && h('div', { class: 'sub' }, e.details)))),
          c.projects?.length > 0 && sec('Projects', c.projects.map((e) => h('div', null, row(e.name, e.tech), e.description && h('div', null, e.description)))))),
      c.footnote && h('p', { class: 'fine' }, c.footnote),
      verified);
  }

  /* ---------- classic / modern / compact / executive ---------- */
  return h('article', { class: cls, ...label },
    h('h1', null, p.fullName || 'Your Name'),
    p.headline && h('div', { class: 'headline' }, p.headline),
    contact && h('div', { class: 'contact' }, contact),
    personal && h('div', { class: 'contact' }, personal),
    c.summary && sec('Profile', h('p', null, c.summary)),
    c.experience?.length > 0 && sec('Experience', c.experience.map((e) => h('div', null, row(`${e.role || ''}${e.company ? ', ' + e.company : ''}`, dateRange(e)), e.location && h('div', { class: 'sub' }, e.location), bullets(e)))),
    c.projects?.length > 0 && sec('Projects', c.projects.map((e) => h('div', null, row(e.name, e.tech), e.description && h('div', null, e.description)))),
    c.education?.length > 0 && sec('Education', c.education.map((e) => h('div', null, row(`${eduTitle(e)}${e.school ? ', ' + e.school : ''}`, dateRange(e)), e.details && h('div', { class: 'sub' }, e.details)))),
    c.skills?.length > 0 && sec('Skills', h('p', null, c.skills.join(', '))),
    c.certifications?.length > 0 && sec('Certifications', h('ul', null, c.certifications.map((e) => h('li', null, certLine(e))))),
    c.languages?.length > 0 && sec('Languages', h('p', null, c.languages.map(langLine).join(', '))),
    showRefs && sec('Referees', c.referees.map((r) => h('p', null, refLine(r)))),
    c.footnote && h('p', { class: 'fine' }, c.footnote),
    verified);
}

/* ---------- cover letters ---------- */
const GENERIC = /^dear\s+(sir|madam|hiring|recruit|human|team|to whom)/i;
const SIGNOFF = /^(yours\s+(sincerely|faithfully|truly)|sincerely|best regards|kind regards|warm regards|regards|respectfully|thank you)\b/i;

// Splits letter text into salutation, body paragraphs and sign-off so each format can place them itself.
export function parseLetter(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  let salutation = '';
  if (blocks[0] && /^dear\b/i.test(blocks[0]) && blocks[0].length < 80) salutation = blocks.shift().replace(/\n.*/s, '');
  let closing = '', signed = '';
  const last = blocks[blocks.length - 1];
  if (last && SIGNOFF.test(last.split('\n')[0]) && last.length < 160) {
    blocks.pop();
    [closing, signed] = [last.split('\n')[0].replace(/,?\s*$/, ','), last.split('\n').slice(1).join(' ').trim()];
  }
  return { salutation, paragraphs: blocks, closing, signed };
}

export function letterParts({ text, personal = {}, job = {}, date = new Date() }) {
  const parsed = parseLetter(text);
  const salutation = parsed.salutation || (job.company ? 'Dear Sir/Madam,' : 'Dear Hiring Manager,');
  const generic = GENERIC.test(salutation);
  const name = personal.fullName || parsed.signed || '';
  return {
    name,
    sender: [personal.location, personal.phone, personal.email].filter(Boolean),
    date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    recipient: ['The Human Resource Manager', job.company].filter(Boolean),
    subject: job.title ? `RE: APPLICATION FOR THE POSITION OF ${job.title.toUpperCase()}` : '',
    salutation: /[,:]$/.test(salutation) ? salutation : salutation + ',',
    paragraphs: parsed.paragraphs,
    closing: generic ? 'Yours faithfully,' : 'Yours sincerely,',
  };
}

export function renderLetter({ text, personal, job, format = 'formal', date }) {
  const L = letterParts({ text, personal, job, date });
  const body = [h('p', { class: 'sal' }, L.salutation), ...L.paragraphs.map((t) => h('p', null, t.split('\n').flatMap((ln, i) => (i ? [h('br'), ln] : [ln])))), h('p', { class: 'close' }, L.closing), h('div', { class: 'sig' }), h('p', { class: 'nm' }, L.name)];
  const subject = L.subject && h('p', { class: 'subj' }, L.subject);
  const recipient = (label) => h('div', { class: 'to' }, label && h('div', null, label), L.recipient.map((r, i) => h('div', { class: i && L.recipient.length > 1 ? 'b' : '' }, r)));
  const shell = (cls, ...kids) => h('article', { class: `paper letter-doc l-${format} ${cls}`, 'aria-label': 'Cover letter preview' }, ...kids);
  if (format === 'right') {
    return shell('', h('div', { class: 'from' }, h('div', { class: 'b' }, L.name), L.sender.slice().reverse().map((s) => h('div', null, s)), h('div', null, L.date)), recipient('To:'), subject, ...body);
  }
  if (format === 'letterhead') {
    return shell('', h('header', { class: 'lh' }, h('div', { class: 'nm1' }, L.name), h('div', { class: 'lh-sub' }, L.sender.join('  ·  '))), h('div', { class: 'date' }, L.date), recipient(''), subject, ...body);
  }
  return shell('', h('div', { class: 'from' }, h('div', null, L.name), L.sender.map((s) => h('div', null, s)), h('div', { class: 'date' }, L.date)), recipient(''), subject, ...body);
}
