// Shared by the browser and the Netlify function. Plain ES module, no dependencies.

// Everything is free. AI writing has a monthly fair-use allowance so the free AI quota lasts for everyone.
export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Free',
    price: 0,
    tagline: 'Everything, free for everyone.',
    features: ['Unlimited resumes & versions', 'All templates and letter formats', 'AI writing, tailoring, ATS scan, interview prep', 'Skill roadmaps, portfolio & document verification'],
    limits: { resumes: Infinity, rewrites: 200, letters: Infinity, ats: true, interview: true, roadmap: true, portfolio: true },
  },
};

export const PLAN_ORDER = ['starter'];

export const COUNTRIES = {
  US: { id: 'US', name: 'United States', doc: 'Resume', paper: 'Letter', dob: false, nationality: false, referees: false, note: 'No photo, age, or marital status. One page preferred; two for 10+ years of experience.' },
  CA: { id: 'CA', name: 'Canada', doc: 'Resume', paper: 'Letter', dob: false, nationality: false, referees: false, note: 'No photo or personal details. References on request.' },
  UK: { id: 'UK', name: 'United Kingdom', doc: 'CV', paper: 'A4', dob: false, nationality: false, referees: true, note: 'Two pages max. No photo or date of birth. References are optional.' },
  EU: { id: 'EU', name: 'European Union', doc: 'CV', paper: 'A4', dob: false, nationality: true, referees: false, note: 'Europass-style. Nationality is common; photo optional (not included here).' },
  AF: { id: 'AF', name: 'Africa (East / West / Southern)', doc: 'CV', paper: 'A4', dob: true, nationality: true, referees: true, note: 'Date of birth, nationality and two referees are customary in many African markets.' },
  AU: { id: 'AU', name: 'Australia / New Zealand', doc: 'Resume', paper: 'A4', dob: false, nationality: false, referees: true, note: 'Include referees. No date of birth or photo.' },
  IN: { id: 'IN', name: 'India', doc: 'Resume', paper: 'A4', dob: true, nationality: true, referees: false, note: 'Date of birth and nationality are commonly included.' },
  ME: { id: 'ME', name: 'Middle East / Gulf', doc: 'CV', paper: 'A4', dob: true, nationality: true, referees: false, note: 'Nationality and visa status are expected by many employers.' },
};

export const TEMPLATES = [
  { id: 'classic', name: 'Classic', desc: 'Single column, serif headings. The safest choice for any parser.', ats: 'Highest' },
  { id: 'modern', name: 'Modern', desc: 'Green accent header with a clean one-column body.', ats: 'High' },
  { id: 'compact', name: 'Compact', desc: 'Dense layout that fits long careers on two pages.', ats: 'High' },
  { id: 'executive', name: 'Executive', desc: 'Refined serif look with a gold rule for senior roles.', ats: 'High' },
  { id: 'academic', name: 'Academic', desc: 'Shaded header, ruled sections and bordered tables for qualifications and placements. Suits graduates and professional bodies.', ats: 'Good' },
  { id: 'timeline', name: 'Timeline', desc: 'Dates in a left margin, details on the right. The familiar European CV rhythm.', ats: 'High' },
  { id: 'rail', name: 'Rail', desc: 'A side rail for contact, skills and languages beside the main story. Reads fast.', ats: 'Good' },
];

export const LETTER_FORMATS = [
  { id: 'formal', name: 'Formal application', desc: 'Sender block top left, recipient, bold RE: line. The standard for applications in East Africa and the UK.' },
  { id: 'right', name: 'Right-aligned sender', desc: 'Sender and date aligned right, recipient on the left, capitalised RE: line.' },
  { id: 'letterhead', name: 'Letterhead', desc: 'Name as a letterhead with an accent rule. Warmer and more modern.' },
];

export const LANGUAGE_LEVELS = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'];

export const emptyContent = () => ({
  personal: { fullName: '', headline: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', dob: '', nationality: '', registration: '' },
  summary: '',
  experience: [],
  education: [],
  projects: [],
  skills: [],
  certifications: [],
  languages: [],
  referees: [],
  footnote: '',
  options: { showPersonal: false },
});

export function formatMonth(ym) {
  if (!ym) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return String(ym);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(m[2]) - 1] || ''} ${m[1]}`.trim();
}

export function dateRange(item) {
  const start = formatMonth(item.start);
  const end = item.current ? 'Present' : formatMonth(item.end);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

export const resumeToText = (c) => {
  const p = c.personal || {};
  const lines = [p.fullName, p.headline, p.registration, [p.email, p.phone, p.location].filter(Boolean).join(' | '), c.summary];
  for (const e of c.experience || []) lines.push(`${e.role} ${e.company} ${e.location || ''} ${dateRange(e)}`, ...(e.bullets || []));
  for (const e of c.education || []) lines.push(`${e.degree} ${e.field || ''} ${e.school} ${e.details || ''}`);
  for (const e of c.projects || []) lines.push(`${e.name} ${e.tech || ''} ${e.description || ''}`);
  lines.push((c.skills || []).join(', '));
  for (const e of c.certifications || []) lines.push(`${e.name} ${e.issuer || ''}`);
  for (const e of c.languages || []) lines.push(`${e.name} ${e.level || ''}`);
  return lines.filter(Boolean).join('\n');
};
