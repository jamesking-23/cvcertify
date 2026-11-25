// Offline intent router. It never writes answers: it only decides WHICH deterministic action in actions.mjs should run.
//
// How: every example phrase in INTENTS is turned into a vector once, at start-up. A user message is turned into a vector the
// same way and compared (cosine similarity) with every example. The best-scoring intent wins if it clears the confidence
// threshold; otherwise the caller gets a polite fallback. No network, no API key, no model download, pure JavaScript.
//
// The embedder is a hashed bag of words, word pairs and character n-grams, weighted by how rare each word is across the
// bank (IDF). Character n-grams make it forgiving of typos, broken grammar and slang spellings. It is deterministic and
// takes well under a millisecond per message. To use a neural embedding model instead, replace `embed()` and
// `buildIndex()` only; nothing else depends on how vectors are made.

import { env } from './util.mjs';

/* ---------- intent bank: 5-8 phrases each, mixing formal, casual, broken grammar and Ugandan / East African slang ---------- */
export const INTENTS = {
  greet_user: [
    'hello', 'hi', 'hiya', 'good morning', 'wagwan', 'oli otya', 'habari', 'mambo vipi',
  ],
  help_menu: [
    'help', 'what can you do', 'show me the commands', 'how do i use this', 'i dont know what to do', 'menu',
    'what are your features', 'nkozese ntya',
  ],
  write_summary: [
    'write my professional summary', 'can you write a summary for my cv', 'summary of my cv make', 'give me a profile statement',
    'i need an about me section for my resume', 'how i can write summary', 'make my cv intro nice', 'create a professional profile for my cv',
  ],
  improve_bullet: [
    'improve this bullet point', 'make my bullet sound better', 'rewrite this line on my cv', 'fix this sentence for my resume',
    'make this cv sentence better', 'polish this cv line', 'rephrase my experience line',
  ],
  write_cover_letter: [
    'write a cover letter for me', 'i need an application letter', 'can you draft a letter for a job', 'cover letter for the job i am applying',
    'make me application letter please', 'cover letter for the role at a company', 'help me write to the employer', 'draft application letter',
  ],
  ats_score: [
    'check my ats score', 'will my cv pass the ats', 'how does my cv score against this job', 'scan my resume for keywords',
    'ats checker', 'how well does my resume match the job', 'compare my cv with the job description', 'check keywords on my cv',
  ],
  interview_questions: [
    'give me interview questions', 'help me prepare for an interview', 'what will they ask me in the interview', 'mock interview questions',
    'interview tips and prep', 'i have an interview tomorrow what to expect', 'interview questions for this role', 'interview coming how to prepare',
  ],
  answer_interview_question: [
    'how do i answer the about yourself question', 'answer for introduce yourself in an interview', 'how should i introduce myself in an interview',
    'what do i say when they ask about me', 'how to answer why should we hire you', 'how do i answer what are your weaknesses',
    'what are my strengths for the interview',
  ],
  calculate: [
    'calculate this for me', 'what is 15 percent of 2000000', 'work out this sum', 'how much is 250000 plus 40000',
    'help me do some maths', 'what is 12 times 45', 'solve this calculation', 'add these numbers up',
  ],
  skill_roadmap: [
    'what skills should i learn', 'make me a learning plan', 'skill roadmap for the job', 'what skills am i missing for this role',
    'how do i close my skill gaps', 'i want to learn what to get this job', 'plan to improve my skills',
  ],
  profile_completeness: [
    'how complete is my profile', 'what is missing on my cv', 'profile completion progress', 'how far am i with my profile', 'what should i add next',
    'check if my profile is ready', 'my profile percentage', 'what remains in my profile',
  ],
  years_experience: [
    'how many years of experience do i have', 'calculate my years of experience', 'total work experience', 'how many years have i worked',
    'my experience in years', 'years of work i have gotten how many', 'count my experience',
  ],
  template_info: [
    'which resume template should i use', 'show me the cv templates', 'what cv designs and layouts do you have', 'best template for me',
    'list the resume designs', 'what template suits a fresh graduate', 'cv styles available', 'template recommend',
  ],
  country_format: [
    'what is the cv format in uganda', 'how should a resume look in canada', 'cv rules for the uk', 'do i put date of birth on my cv in my country',
    'format for my country', 'what should a cv in kenya contain', 'which details to include on a cv for dubai', 'cv standards in america',
  ],
  no_experience_tips: [
    'i have no work experience', 'first job with nothing on my cv', 'fresh graduate what do i put', 'how do i write a cv with no experience',
    'i am a student with no job history what do i write', 'no experience cv how', 'cv for a student', 'i have never worked before',
  ],
  verify_info: [
    'how does cv verification work', 'what is a verified cv', 'how do employers check my cv is real', 'what does certify do',
    'what is the document id', 'can someone confirm my cv is genuine', 'verification how it works', 'what does certified mean',
  ],
  portfolio_info: [
    'how do i create a portfolio page', 'what is the portfolio feature', 'share my cv as a website', 'can i share my public page with a link',
    'set up my online portfolio', 'portfolio how', 'can i have my own web page',
  ],
  salary_tip: [
    'how much should i ask for as salary', 'salary negotiation advice', 'what salary should i ask for', 'how much pay should i request',
    'expected salary how to answer', 'what salary to put', 'help me negotiate my pay',
  ],
};

/* ---------- embedder ---------- */
const DIM = 2048;
const STOP = new Set('a an the is are am was be to of for on in at it my me i you your can could would please do does this that and or with from about'.split(' '));

export const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function fnv(str, seed = 2166136261) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

function features(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  const out = [];
  for (const w of words) {
    out.push([`w:${w}`, 1, w]);
    const p = `^${w}$`;
    for (let n = 3; n <= 4; n++) for (let i = 0; i + n <= p.length; i++) out.push([`c:${p.slice(i, i + n)}`, 0.22, w]);
  }
  for (let i = 0; i + 1 < words.length; i++) out.push([`b:${words[i]}_${words[i + 1]}`, 0.7, words[i]]);
  return out;
}

let idf = new Map();
let idfDefault = 1;
const wordWeight = (w) => (STOP.has(w) ? 0.2 : idf.get(w) ?? idfDefault);

export function embed(text) {
  const v = new Float32Array(DIM);
  for (const [key, base, word] of features(text)) {
    const h = fnv(key);
    v[h % DIM] += (h & 0x80000000 ? -1 : 1) * base * wordWeight(word);
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/* ---------- index, built once at start-up ---------- */
let index = null; // [{ intent, phrase, vec }]

export function buildIndex(bank = INTENTS) {
  const docs = Object.values(bank).flat();
  const df = new Map();
  for (const d of docs) for (const w of new Set(normalize(d).split(' '))) df.set(w, (df.get(w) || 0) + 1);
  idf = new Map([...df].map(([w, n]) => [w, Math.log(1 + docs.length / n)]));
  idfDefault = Math.log(1 + docs.length);
  index = [];
  for (const [intent, phrases] of Object.entries(bank)) for (const phrase of phrases) index.push({ intent, phrase, vec: embed(phrase) });
  return index.length;
}
buildIndex();

export const DEFAULT_THRESHOLD = 0.65;
// Raw cosine similarity of this embedder runs lower than a neural model's (unrelated text sits near 0.1, a clear paraphrase near 0.4-0.8).
// `confidence` rescales it so the 0.65 default means the same thing here: cosine / 0.6, capped at 1.
export const CONFIDENCE_SCALE = 0.6;
export const confidence = (cosine) => Math.max(0, Math.min(1, cosine / CONFIDENCE_SCALE));
export const threshold = () => {
  const t = Number(env('ASSISTANT_MIN_CONFIDENCE'));
  return t > 0 && t < 1 ? t : DEFAULT_THRESHOLD;
};

// Long messages often contain pasted text ("ats score: <whole job description>"). Route on the instruction, not the paste.
export function routingText(message) {
  const m = String(message || '').trim();
  const head = m.split(/[:\n]/)[0].trim();
  const base = head.split(/\s+/).length >= 2 ? head : m;
  return base.split(/\s+/).slice(0, 24).join(' ');
}

/** Rank intents for a message. Returns [{ intent, score, phrase }] best first. */
export function classify(message) {
  const q = embed(routingText(message));
  const best = new Map();
  for (const e of index) {
    const s = dot(q, e.vec);
    if (!best.has(e.intent) || s > best.get(e.intent).score) best.set(e.intent, { intent: e.intent, score: s, phrase: e.phrase });
  }
  return [...best.values()].map((r) => ({ ...r, confidence: confidence(r.score) })).sort((a, b) => b.score - a.score);
}
