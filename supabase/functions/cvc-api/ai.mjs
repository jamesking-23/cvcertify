// The writing helpers behind the app. Everything runs offline in this process: no AI service, no API key, no network call.
// These helpers call the profile-aware writing engine in offline.mjs directly: same input data, no invented facts.
// The assistant chat is not here: see tier1.mjs (browser), cache.mjs and ask.mjs (server), gemini.mjs (Tier 3 only).

import { COUNTRIES, resumeToText } from './constants.js';
import { extractKeywords } from './ats.mjs';
import { yearsOfExperience } from './profile.mjs';
import { dateRange } from './constants.js';
import * as offline from './offline.mjs';

export { yearsOfExperience, dateRange };
export const basicBullet = (b) => offline.improveBullet(b)[0];

const MODE = 'local';

export async function rewriteBullets({ bullets }) {
  const variants = offline.bulletVariants(bullets, false);
  return { bullets: variants.map((v) => v[0]), variants, mode: MODE };
}

export async function writeSummary({ content, job }) {
  const options = offline.summaryOptions(content, job);
  return { summary: options[1]?.text || options[0].text, options, mode: MODE };
}

export async function tailorResume({ content, job }) {
  const keywords = extractKeywords(job.description, 20);
  const text = resumeToText(content).toLowerCase();
  const toFront = (content.skills || []).slice().sort((a, b) => Number(keywords.includes(b.toLowerCase())) - Number(keywords.includes(a.toLowerCase())));
  const summary = content.summary || offline.summaryOptions(content, job)[1]?.text || '';
  return {
    content: { ...content, summary, skills: toFront, experience: (content.experience || []).map((e) => ({ ...e, bullets: (e.bullets || []).map((b) => offline.improveBullet(b, e.current)[0] || b) })) },
    notes: [
      'Bullets were tidied and your skills were reordered so the ones this job asks for come first.',
      ...keywords.filter((k) => !text.includes(k)).slice(0, 5).map((k) => `The job mentions "${k}". If you have this experience, add it to your profile.`),
    ],
    mode: MODE,
  };
}

export async function writeCoverLetter({ content, job, tone, country }) {
  return { letter: offline.coverLetter(content, job, tone, COUNTRIES[country] ? country : 'US'), mode: MODE };
}

export async function interviewPrep({ content, job }) {
  return { mode: MODE, questions: offline.interviewQuestions(content, job) };
}

export async function skillRoadmap({ content, missing }) {
  return { mode: MODE, steps: offline.roadmapSteps(missing, content) };
}
