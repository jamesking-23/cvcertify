// Deterministic ATS scoring: no AI needed. Compares resume text with a job description.

import { resumeToText } from './constants.js';

const STOP = new Set(
  `a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours
  able across etc including within without work working works role team teams candidate candidates position job responsibilities requirements required preferred ideal strong good great excellent plus years year experience experienced looking join company ability skills skill knowledge using use used understanding must need needs per via new best well make making help helping`
    .split(/\s+/),
);

// Multi-word phrases and tools worth matching as a unit.
const PHRASES = [
  'project management', 'machine learning', 'data analysis', 'data science', 'customer service', 'stakeholder management', 'product management',
  'business development', 'supply chain', 'financial reporting', 'financial analysis', 'quality assurance', 'continuous integration', 'unit testing',
  'rest api', 'api design', 'cloud computing', 'agile methodology', 'team leadership', 'public speaking', 'content marketing', 'social media',
  'sales forecasting', 'risk management', 'human resources', 'budget management', 'problem solving', 'user experience', 'user research',
  'monitoring and evaluation', 'grant writing', 'community outreach', 'microsoft excel', 'power bi', 'google analytics', 'ci/cd',
];

const SYNONYMS = {
  js: 'javascript', ts: 'typescript', k8s: 'kubernetes', postgres: 'postgresql', ml: 'machine learning', ai: 'artificial intelligence',
  'node.js': 'nodejs', 'react.js': 'react', 'vue.js': 'vue', qa: 'quality assurance', hr: 'human resources', ux: 'user experience',
  'm&e': 'monitoring and evaluation', 'ci/cd': 'cicd',
};

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/\.net/g, 'dotnet')
    .replace(/ci\/cd/g, 'cicd')
    .replace(/m&e/g, 'monitoring and evaluation');

function tokens(s) {
  return norm(s)
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
    .map((t) => SYNONYMS[t] || t);
}

const stem = (w) => w.replace(/(ing|ed|es|s)$/, (m, _s, off) => (w.length - m.length >= 4 ? '' : m));

export function extractKeywords(jd, max = 25) {
  const text = norm(jd);
  const counts = new Map();
  const bump = (k, n = 1) => counts.set(k, (counts.get(k) || 0) + n);

  for (const ph of PHRASES) {
    const p = norm(ph);
    const hits = text.split(p).length - 1;
    if (hits) bump(p, hits * 2.5);
  }
  const toks = tokens(jd);
  for (const t of toks) {
    if (t.length < 2 || STOP.has(t) || /^\d+$/.test(t)) continue;
    bump(t);
  }
  // Skills-looking tokens (contain digits, +, #, or are capitalised in the original) get a boost.
  const original = String(jd || '');
  for (const m of original.matchAll(/\b([A-Z][A-Za-z0-9+#.]{1,}|[A-Za-z]+\d[\w.]*)\b/g)) {
    const t = SYNONYMS[m[1].toLowerCase()] || m[1].toLowerCase();
    if (counts.has(t)) bump(t, 0.5);
  }
  return [...counts.entries()]
    .filter(([k, v]) => v >= 1 && !STOP.has(k))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([k]) => k);
}

function hasKeyword(resumeNorm, resumeStems, kw) {
  if (kw.includes(' ')) return resumeNorm.includes(kw);
  if (resumeStems.has(stem(kw)) || resumeStems.has(kw)) return true;
  return false;
}

export function scoreResume(content, jd) {
  const text = resumeToText(content);
  const rNorm = norm(text);
  const rStems = new Set(tokens(text).flatMap((t) => [t, stem(t)]));
  const keywords = extractKeywords(jd);
  const matched = [];
  const missing = [];
  for (const kw of keywords) (hasKeyword(rNorm, rStems, kw) ? matched : missing).push(kw);
  const keywordScore = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;

  const issues = [];
  const checks = { contact: 0, summary: 0, experience: 0, metrics: 0, structure: 0 };
  const p = content.personal || {};

  if (p.email && p.phone) checks.contact = 100;
  else {
    checks.contact = p.email || p.phone ? 60 : 0;
    issues.push({ level: 'warn', text: 'Add both an email address and phone number so recruiters can reach you.' });
  }
  const sumWords = (content.summary || '').trim().split(/\s+/).filter(Boolean).length;
  if (sumWords >= 25 && sumWords <= 90) checks.summary = 100;
  else if (sumWords > 0) {
    checks.summary = 60;
    issues.push({ level: 'info', text: sumWords < 25 ? 'Your summary is short. Aim for 2-4 sentences (about 40-70 words).' : 'Your summary is long. Trim it to 2-4 sentences.' });
  } else issues.push({ level: 'warn', text: 'Add a professional summary that mirrors the language of the job description.' });

  const bullets = (content.experience || []).flatMap((e) => e.bullets || []);
  if ((content.experience || []).length) checks.experience = 100;
  else issues.push({ level: 'warn', text: 'No work experience listed. Add roles, internships, volunteering or projects.' });

  const withNumbers = bullets.filter((b) => /\d/.test(b)).length;
  checks.metrics = bullets.length ? Math.min(100, Math.round((withNumbers / bullets.length) * 200)) : 0;
  if (bullets.length && withNumbers / bullets.length < 0.4) issues.push({ level: 'info', text: 'Quantify more achievements (%, amounts, team sizes, time saved). Aim for numbers in about half your bullets.' });
  const weak = bullets.filter((b) => /^(responsible for|helped|worked on|assisted|duties included)/i.test(b.trim())).length;
  if (weak) issues.push({ level: 'info', text: `${weak} bullet${weak > 1 ? 's start' : ' starts'} with a weak phrase. Lead with strong verbs like "Led", "Built", "Reduced" or "Launched".` });

  const hasEdu = (content.education || []).length > 0;
  const hasSkills = (content.skills || []).length >= 5;
  checks.structure = (hasEdu ? 50 : 0) + (hasSkills ? 50 : 25);
  if (!hasEdu) issues.push({ level: 'info', text: 'Add your education, even if it is secondary school or a short course.' });
  if (!hasSkills) issues.push({ level: 'warn', text: 'List at least 5 skills so parsers can match your profile.' });
  if (missing.length) issues.push({ level: 'warn', text: `Missing ${missing.length} keyword${missing.length > 1 ? 's' : ''} from the job description: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.` });

  const quality = Math.round(checks.contact * 0.2 + checks.summary * 0.2 + checks.experience * 0.25 + checks.metrics * 0.2 + checks.structure * 0.15);
  const score = Math.round(keywordScore * 0.6 + quality * 0.4);
  return { score, keywordScore, quality, checks, keywords, matched, missing, issues };
}
