// Understands a person's profile so writing can fit them: someone with no work history must never be
// written about as if they had a job, and a senior person should not be written about as a graduate.

const MONTHS = (ym) => { const m = /^(\d{4})-(\d{2})/.exec(ym || ''); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };

export function yearsOfExperience(content, now = new Date()) {
  const nowM = now.getFullYear() * 12 + now.getMonth();
  let months = 0;
  for (const e of content.experience || []) {
    const s = MONTHS(e.start);
    if (s == null) continue;
    const end = e.current || !e.end ? nowM : MONTHS(e.end);
    if (end != null) months += Math.max(0, end - s);
  }
  return Math.floor(months / 12);
}

export const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
export const stripEnd = (s) => String(s || '').trim().replace(/[.\s]+$/, '');
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

// A bullet that begins with a past-tense or base-form action word can follow "I" in a letter.
const IRREGULAR = new Set('built led cut ran grew drove won wrote made set took sold taught kept found gave began brought chose held led met paid put read saw sent spent thought understood wrote'.split(' '));
export const startsWithVerb = (b) => { const w = String(b).trim().split(/\s+/)[0].toLowerCase(); return /(ed)$/.test(w) || IRREGULAR.has(w); };

export function profileFacts(content, now = new Date()) {
  const p = content.personal || {};
  const exp = (content.experience || []).filter((e) => e.role || e.company || (e.bullets || []).length);
  const edu = (content.education || []).filter((e) => e.school || e.degree || e.field);
  const years = yearsOfExperience(content, now);
  const level = !exp.length ? 'none' : years < 2 ? 'junior' : years < 6 ? 'mid' : 'senior';
  const current = exp.find((e) => e.current) || exp[0] || null;

  const nowM = now.getFullYear() * 12 + now.getMonth();
  const eduSorted = edu.slice().sort((a, b) => (MONTHS(b.end) ?? 1e9) - (MONTHS(a.end) ?? 1e9));
  const last = eduSorted[0] || null;
  const lastEnd = last ? MONTHS(last.end) : null;
  const studying = !!last && lastEnd != null && lastEnd > nowM;
  const recentGrad = !!last && lastEnd != null && lastEnd <= nowM && nowM - lastEnd <= 36;

  const bullets = exp.flatMap((e) => (e.bullets || []).map((b) => ({ text: stripEnd(b), company: e.company, role: e.role })));
  const withNumbers = bullets.filter((b) => /\d/.test(b.text));
  const achievements = [...withNumbers, ...bullets.filter((b) => !/\d/.test(b.text))].slice(0, 4);

  const projects = (content.projects || []).filter((x) => x.name);
  const certs = (content.certifications || []).filter((x) => x.name);
  const skills = (content.skills || []).filter(Boolean);
  const field = last?.field || '';
  const degree = last?.degree || '';
  const eduName = degree && field ? `${degree} in ${field}` : degree || field || '';
  return {
    name: p.fullName || '', headline: p.headline || '', years, level, hasExperience: exp.length > 0, hasEducation: edu.length > 0,
    current, currentRole: current?.role || '', currentCompany: current?.company || '', employers: [...new Set(exp.map((e) => e.company).filter(Boolean))],
    school: last?.school || '', degree, field, eduName, studying, recentGrad, eduDetails: last?.details || '',
    skills, certs, projects, languages: content.languages || [], achievements, hasProjects: projects.length > 0,
  };
}
