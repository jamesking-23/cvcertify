// The app's own facts. They are the "RAG" context for Tier 3 and the unit of cache invalidation: every cached answer
// records which facts (and which version of each) it was built from. Edit a fact's text and its version changes, so old
// answers built from it are dropped automatically; invalidateCacheByFact(id) (cache.mjs) removes them immediately.
// Facts are general and contain nothing personal, because answers built from them are shared between users.

import { COUNTRIES, TEMPLATES } from './constants.js';

const countryFact = () => Object.values(COUNTRIES).map((c) => `${c.name}: call it a ${c.doc}, ${c.paper} paper. ${c.note} Date of birth ${c.dob ? 'commonly included' : 'leave off'}; nationality ${c.nationality ? 'commonly included' : 'leave off'}; referees ${c.referees ? 'listed' : 'not needed'}.`).join('\n');

export const FACTS = [
  { id: 'verification', text: 'CV-Certify gives a certified resume a public document ID and stores a fingerprint of its contents. Anyone can enter the ID on the Verify page to see if the CV is genuine and unchanged. Editing the CV afterwards shows it as changed until it is certified again. The owner can revoke it at any time. Certified resumes show a unique security seal drawn from the document ID.' },
  { id: 'portfolio', text: 'The Portfolio feature turns a resume into a public web page with a chosen web address. A certified resume adds a verification seal. Email and phone only show if the owner ticks the box. The page can be switched off at any time.' },
  { id: 'templates', text: `CV-Certify templates: ${TEMPLATES.map((t) => `${t.name} (${t.desc})`).join(' ')} Templates can be switched at any time without retyping.` },
  { id: 'country-formats', text: countryFact() },
  { id: 'ats-basics', text: 'Applicant tracking systems scan for keywords from the job advert. Use the exact skills and tools named in the advert where they are true for you, a plain single-column layout, standard headings (Experience, Education, Skills), and avoid tables, images and text boxes for key content. Mention numbers: percentages, amounts, team sizes, time saved.' },
  { id: 'cv-length', text: 'One page suits students and people with under about ten years of experience; two pages suit longer careers. Put the most relevant and most recent items first. Leave out old, unrelated jobs and personal details the country does not expect.' },
  { id: 'cv-gaps', text: 'For a gap in the CV, be honest and brief. Name what you did: study, caring for family, health, volunteering, courses, freelance or short-term work, and what you learned or kept up. Use years rather than months if that is accurate, and be ready to explain it in one calm sentence at interview.' },
  { id: 'cover-letter', text: 'A cover letter is one page: who you are and the exact role, one or two real achievements or relevant facts, how your skills match what the advert asks, and a polite close asking for an interview. Address a named person when you can. Never repeat the whole CV.' },
  { id: 'interview-structure', text: 'Prepare for interviews with the STAR method: Situation, Task, Action, Result. Prepare a one-minute introduction (present, past, future), three examples of your best work, a reason you want this role and this employer, and two questions to ask them. Research the employer and arrive early or test your video link.' },
  { id: 'salary', text: 'For salary, research the typical range for the role and city, decide the number you would be happy with, answer with a range whose lower end you can accept, and tie your ask to results you have delivered. Let the employer name a figure first when possible. Consider benefits such as transport, medical cover and leave as part of the offer.' },
  { id: 'references', text: 'Referees are people who can speak about your work, such as a former manager, lecturer or supervisor. Ask permission first and give them your CV. In many African, UK and Australian applications two referees are listed; in the US and Canada they are given on request.' },
  { id: 'no-experience', text: 'With no work history lead with education, projects, coursework, certificates, volunteering, internships, leadership roles and a skills list that matches the job. Keep the summary short and name the role you want. Do not invent experience.' },
  { id: 'job-search', text: 'Job search habits that work: tailor the CV and summary to each advert, apply early, follow up politely after about a week, keep a list of applications, tell people in your network what you are looking for, and keep LinkedIn consistent with your CV.' },
  { id: 'cv-certify-scope', text: 'CV-Certify is free. It builds profile-based resumes and cover letters, scores a resume against a job advert, prepares interview questions, plans skills to learn, publishes a portfolio page and lets anyone verify a certified resume.' },
];

const h8 = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
export const factRef = (f) => `${f.id}:${h8(f.text)}`;
const byId = new Map(FACTS.map((f) => [f.id, f]));

/** True while every "id:hash" still matches today's text for that fact. A changed or removed fact makes it stale. */
export const refsAreCurrent = (refs) => (refs || []).every((r) => { const [id, hash] = String(r).split(':'); const f = byId.get(id); return !!f && h8(f.text) === hash; });

const STOP = new Set('a an the is are am was be to of for on in at it my me i you your can could would please do does this that and or with from about how what when where why which should will'.split(' '));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, (m) => (w.length - m.length >= 4 ? '' : m));
const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)).map(stem);

/** Local retrieval: rank facts by IDF-weighted word overlap with the question. Returns up to k facts that share any word. */
export function retrieveFacts(query, k = 4) {
  const q = new Set(toks(query));
  const docs = FACTS.map((f) => ({ f, t: new Set(toks(f.text)) }));
  const df = new Map();
  for (const d of docs) for (const w of d.t) df.set(w, (df.get(w) || 0) + 1);
  return docs
    .map(({ f, t }) => ({ f, s: [...q].reduce((a, w) => a + (t.has(w) ? Math.log(1 + docs.length / df.get(w)) : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.f);
}
