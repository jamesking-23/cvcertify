// Renders a resume as a styled "paper" element. Shared by the editor preview, print/PDF and public views.
import { h, icon } from './ui.js';
import { COUNTRIES, dateRange } from './shared/constants.js';

export function renderPaper({ content: c, template = 'classic', country = 'US', docId = null, verifyUrl = '', stale = false }) {
  const p = c.personal || {};
  const rules = COUNTRIES[country] || COUNTRIES.US;
  const sec = (title, ...kids) => [h('h2', null, title), ...kids];
  const row = (l, r) => h('div', { class: 'r' }, h('span', null, l), h('span', null, r || ''));
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean).join('  ·  ');
  const personal = [rules.dob && p.dob ? `Date of birth: ${p.dob}` : '', rules.nationality && p.nationality ? `Nationality: ${p.nationality}` : ''].filter(Boolean).join('  ·  ');

  const paper = h(
    'article',
    { class: `paper t-${template} ${rules.paper === 'Letter' ? 'letter' : ''}`, 'aria-label': `${rules.doc} preview` },
    h('h1', null, p.fullName || 'Your Name'),
    p.headline && h('div', { class: 'headline' }, p.headline),
    contact && h('div', { class: 'contact' }, contact),
    personal && h('div', { class: 'contact' }, personal),
    c.summary && sec('Profile', h('p', null, c.summary)),
    c.experience?.length > 0 && sec('Experience', c.experience.map((e) => h('div', null, row(`${e.role || ''}${e.company ? ', ' + e.company : ''}`, dateRange(e)), e.location && h('div', { class: 'sub' }, e.location), e.bullets?.length > 0 && h('ul', null, e.bullets.map((b) => h('li', null, b)))))),
    c.projects?.length > 0 && sec('Projects', c.projects.map((e) => h('div', null, row(e.name, e.tech), e.description && h('div', null, e.description)))),
    c.education?.length > 0 && sec('Education', c.education.map((e) => h('div', null, row(`${e.degree || ''}${e.field ? ' in ' + e.field : ''}${e.school ? ', ' + e.school : ''}`, dateRange(e)), e.details && h('div', { class: 'sub' }, e.details)))),
    c.skills?.length > 0 && sec('Skills', h('p', null, c.skills.join(', '))),
    c.certifications?.length > 0 && sec('Certifications', h('ul', null, c.certifications.map((e) => h('li', null, `${e.name}${e.issuer ? ' – ' + e.issuer : ''}${e.year ? ' (' + e.year + ')' : ''}`)))),
    c.languages?.length > 0 && sec('Languages', h('p', null, c.languages.map((l) => `${l.name}${l.level ? ' (' + l.level + ')' : ''}`).join(', '))),
    rules.referees && c.referees?.length > 0 && sec('Referees', c.referees.map((r) => h('p', null, `${r.name}${r.title ? ', ' + r.title : ''}${r.contact ? ' – ' + r.contact : ''}`))),
    docId && !stale && h('div', { class: 'verified' }, h('span', null, icon('shield'), ' Verified by CV-Certify · ID ', h('b', null, docId)), h('span', null, verifyUrl.replace(/^https?:\/\//, ''))),
  );
  return paper;
}
