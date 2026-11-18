// AI writing helpers. Uses the Anthropic Messages API when ANTHROPIC_API_KEY is set.
// Every task has a deterministic fallback so the app stays usable without a key ("basic mode").

import { HttpError, env } from './util.mjs';
import { resumeToText, COUNTRIES, dateRange } from './constants.js';
import { extractKeywords } from './ats.mjs';

export const aiEnabled = () => !!env('ANTHROPIC_API_KEY');

async function claude({ system, user, maxTokens = 2000 }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(502, `The AI service returned an error (${res.status}). ${res.status === 401 ? 'Check ANTHROPIC_API_KEY.' : 'Please try again.'}`, 'ai_error', body.slice(0, 200));
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

function parseJson(raw) {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = m ? m[1] : raw.slice(raw.search(/[{[]/));
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(502, 'The AI returned an unreadable answer. Please try again.', 'ai_parse');
  }
}

const RULES = `Hard rules: never invent employers, job titles, dates, degrees, certifications, metrics, or skills that are not in the candidate's data. You may rephrase, reorder, tighten and emphasise. If a number is missing, do not make one up; use a clear action and outcome instead. Plain text only, no markdown.`;

const fence = (label, body) => `<${label}>\n${body}\n</${label}>`;

/* ---------- fallbacks ---------- */

const VERBS = { responsible: 'Managed', helped: 'Supported', worked: 'Delivered', assisted: 'Supported', handled: 'Managed', did: 'Completed' };
export function basicBullet(b) {
  let s = String(b || '').trim().replace(/^[-•*\s]+/, '');
  s = s.replace(/^responsible for\s+/i, 'Managed ').replace(/^duties included\s+/i, 'Handled ').replace(/^worked on\s+/i, 'Delivered ').replace(/^helped (to )?/i, 'Supported ');
  s = s.replace(/^(\w+)/, (w) => VERBS[w.toLowerCase()] || w);
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s && !/[.!?]$/.test(s)) s += '.';
  return s;
}

function basicSummary(content, job) {
  const p = content.personal || {};
  const years = yearsOfExperience(content);
  const skills = (content.skills || []).slice(0, 5).join(', ');
  const title = job?.title || p.headline || 'professional';
  return `${years ? `${years}+ years of experience` : 'Motivated'} as a ${title}${skills ? `, skilled in ${skills}` : ''}. ${job?.company ? `Keen to contribute to ${job.company}` : 'Focused on delivering measurable results'} through reliable execution and clear communication.`.replace(/\s+/g, ' ');
}

export function yearsOfExperience(content) {
  let months = 0;
  for (const e of content.experience || []) {
    if (!e.start) continue;
    const [sy, sm] = e.start.split('-').map(Number);
    const end = e.current || !e.end ? new Date() : new Date(Number(e.end.split('-')[0]), Number(e.end.split('-')[1]) - 1, 1);
    months += Math.max(0, (end.getFullYear() - sy) * 12 + end.getMonth() - (sm - 1));
  }
  return Math.floor(months / 12);
}

/* ---------- tasks ---------- */

export async function rewriteBullets({ bullets, role, company, job }) {
  if (!aiEnabled()) return { bullets: bullets.map(basicBullet), mode: 'basic' };
  const raw = await claude({
    system: `You are an expert resume writer. Rewrite experience bullet points to be concise, achievement-focused and ATS-friendly. Start each with a strong past-tense verb (present tense for a current role). Keep each under 28 words. ${RULES} Return ONLY a JSON array of strings, same count and order as the input.`,
    user: [fence('role', `${role || ''} at ${company || ''}`), job?.description ? fence('target_job', job.description.slice(0, 4000)) : '', fence('bullets', JSON.stringify(bullets))].filter(Boolean).join('\n'),
  });
  const out = parseJson(raw);
  if (!Array.isArray(out) || out.length !== bullets.length) throw new HttpError(502, 'The AI returned an unexpected result. Please try again.', 'ai_parse');
  return { bullets: out.map((x) => String(x).trim()), mode: 'ai' };
}

export async function writeSummary({ content, job }) {
  if (!aiEnabled()) return { summary: basicSummary(content, job), mode: 'basic' };
  const raw = await claude({
    system: `You write professional resume summaries: 2-3 sentences, 40-65 words, first-person implied (no "I"). Mirror the target job's language where it is truthful. ${RULES} Return ONLY the summary text.`,
    user: [fence('candidate', resumeToText(content).slice(0, 6000)), job?.description ? fence('target_job', `${job.title || ''}\n${job.description.slice(0, 4000)}`) : ''].filter(Boolean).join('\n'),
    maxTokens: 400,
  });
  return { summary: raw.replace(/^["']|["']$/g, ''), mode: 'ai' };
}

export async function tailorResume({ content, job, country }) {
  const keywords = extractKeywords(job.description, 20);
  if (!aiEnabled()) {
    const have = new Set((content.skills || []).map((s) => s.toLowerCase()));
    const text = resumeToText(content).toLowerCase();
    // Only surface keywords the candidate already evidences in their own text; never add unevidenced skills.
    const toFront = (content.skills || []).slice().sort((a, b) => Number(keywords.includes(b.toLowerCase())) - Number(keywords.includes(a.toLowerCase())));
    return {
      content: { ...content, summary: content.summary || basicSummary(content, job), skills: toFront, experience: (content.experience || []).map((e) => ({ ...e, bullets: (e.bullets || []).map(basicBullet) })) },
      notes: [
        'Basic mode: bullets were cleaned up and skills were reordered to match the job. Add an ANTHROPIC_API_KEY for full AI tailoring.',
        ...keywords.filter((k) => !text.includes(k) && !have.has(k)).slice(0, 6).map((k) => `The job mentions "${k}". If you have this experience, add it to your profile.`),
      ],
      mode: 'basic',
    };
  }
  const raw = await claude({
    system: `You tailor resumes to a specific job. Keep the same JSON structure, ids and facts. Rewrite the summary and experience bullets to emphasise relevant evidence and use the job's vocabulary where truthful. Reorder skills so the most relevant come first. Follow ${COUNTRIES[country]?.name || 'US'} conventions. ${RULES} Return ONLY JSON: {"content": <same shape as input>, "notes": [up to 5 short strings about what you changed or what is missing]}.`,
    user: [fence('resume_json', JSON.stringify(content)), fence('target_job', `${job.title || ''} ${job.company ? 'at ' + job.company : ''}\n${job.description.slice(0, 6000)}`)].join('\n'),
    maxTokens: 4000,
  });
  const out = parseJson(raw);
  if (!out?.content?.personal) throw new HttpError(502, 'The AI returned an unexpected result. Please try again.', 'ai_parse');
  return { content: out.content, notes: Array.isArray(out.notes) ? out.notes.slice(0, 6).map(String) : [], mode: 'ai' };
}

export async function writeCoverLetter({ content, job, tone, country }) {
  const p = content.personal || {};
  if (!aiEnabled()) {
    const top = (content.experience || [])[0];
    const skills = (content.skills || []).slice(0, 4).join(', ');
    const body = [
      `Dear Hiring Manager,`,
      `I am writing to apply for the ${job.title || 'open'} position${job.company ? ` at ${job.company}` : ''}. ${top ? `Most recently I worked as ${top.role} at ${top.company}, where ${(top.bullets?.[0] || 'I delivered results for the team').replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, '')}.` : 'I am eager to contribute my skills and learn quickly.'}`,
      `${skills ? `My strengths include ${skills}, which match the requirements of this role. ` : ''}I take pride in reliable delivery, clear communication and continuous improvement.`,
      `I would welcome the chance to discuss how I can contribute to your team. Thank you for your time and consideration.`,
      `Sincerely,\n${p.fullName || ''}`,
    ];
    return { letter: body.join('\n\n'), mode: 'basic' };
  }
  const raw = await claude({
    system: `You write cover letters that sound like the candidate: specific, warm, concise (220-320 words), no clichés like "I am a hard-working team player". Open with a concrete hook tied to the company or role, connect 2-3 real achievements to the job's needs, close with a clear call to action. Tone: ${tone || 'professional'}. Follow ${COUNTRIES[country]?.name || 'US'} business-letter conventions. ${RULES} Start with "Dear Hiring Manager," unless a name is given, and end with a sign-off and the candidate's name. Return ONLY the letter text.`,
    user: [fence('candidate', resumeToText(content).slice(0, 6000)), fence('target_job', `${job.title || ''} ${job.company ? 'at ' + job.company : ''}\n${job.description.slice(0, 5000)}`)].join('\n'),
    maxTokens: 1200,
  });
  return { letter: raw, mode: 'ai' };
}

export async function interviewPrep({ content, job }) {
  const kws = extractKeywords(job.description, 8);
  if (!aiEnabled()) {
    return {
      mode: 'basic',
      questions: [
        { q: 'Tell me about yourself and why you are interested in this role.', tip: 'Use a present-past-future structure: current role, relevant highlights, why this job next.' },
        ...kws.slice(0, 4).map((k) => ({ q: `Describe a time you used ${k} to deliver a result.`, tip: 'Use the STAR method: Situation, Task, Action, Result, and end with a number if you can.' })),
        { q: 'Describe a challenge you faced at work and how you handled it.', tip: 'Pick a real example where you took initiative and learned something.' },
        { q: 'Do you have any questions for us?', tip: 'Ask about success metrics for the first 90 days and how the team collaborates.' },
      ],
    };
  }
  const raw = await claude({
    system: `You are an interview coach. Produce 8 likely interview questions for this candidate and job: mix of behavioural, role-specific and one about gaps or weaknesses visible in the resume. For each, give a short tip that references the candidate's REAL experience from their resume. ${RULES} Return ONLY JSON: [{"q": string, "tip": string}].`,
    user: [fence('candidate', resumeToText(content).slice(0, 5000)), fence('target_job', `${job.title || ''}\n${job.description.slice(0, 4000)}`)].join('\n'),
    maxTokens: 2000,
  });
  const out = parseJson(raw);
  return { mode: 'ai', questions: (Array.isArray(out) ? out : []).slice(0, 10).map((x) => ({ q: String(x.q || ''), tip: String(x.tip || '') })) };
}

export async function skillRoadmap({ content, job, missing }) {
  if (!aiEnabled()) {
    return {
      mode: 'basic',
      steps: missing.slice(0, 6).map((k, i) => ({ skill: k, weeks: 2 + (i % 3) * 2, plan: `Find a beginner course or documentation for "${k}", then build one small project or work example you can add to your resume.` })),
    };
  }
  const raw = await claude({
    system: `You are a career coach. Given a candidate's resume and a target job, list the top skill gaps (max 6) and a realistic learning plan for each. ${RULES} Return ONLY JSON: [{"skill": string, "weeks": number, "plan": string (1-2 sentences, concrete resources or project ideas)}].`,
    user: [fence('candidate', resumeToText(content).slice(0, 5000)), fence('target_job', job.description.slice(0, 4000)), fence('keywords_missing', missing.join(', '))].join('\n'),
    maxTokens: 1500,
  });
  const out = parseJson(raw);
  return { mode: 'ai', steps: (Array.isArray(out) ? out : []).slice(0, 8).map((x) => ({ skill: String(x.skill || ''), weeks: Number(x.weeks) || 4, plan: String(x.plan || '') })) };
}

export async function assistant({ message, history, content, context }) {
  if (!aiEnabled()) {
    return { reply: 'The AI assistant needs an ANTHROPIC_API_KEY to be configured. In the meantime, try the ATS scanner and the "Improve" buttons in the editor, which work in basic mode.', mode: 'basic' };
  }
  const msgs = (history || []).slice(-8).map((m) => `${m.role === 'user' ? 'Candidate' : 'Coach'}: ${String(m.text).slice(0, 1500)}`).join('\n');
  const reply = await claude({
    system: `You are the CV-Certify career assistant. Help with resumes, cover letters, interviews and job search. Be concise and practical. Use the candidate's real data when relevant and never invent facts about them. If asked to rewrite something, give the rewritten text directly. Plain text, short paragraphs, hyphen bullets only if needed.`,
    user: [fence('candidate', resumeToText(content).slice(0, 5000)), context ? fence('context', String(context).slice(0, 3000)) : '', msgs ? fence('conversation', msgs) : '', `Candidate: ${String(message).slice(0, 2000)}`].filter(Boolean).join('\n'),
    maxTokens: 900,
  });
  return { reply, mode: 'ai' };
}

export { dateRange };
