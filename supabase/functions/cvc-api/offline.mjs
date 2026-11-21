// Writing engine used when no AI key is configured. It is not a template with blanks: it reads the profile
// (see profile.mjs), chooses phrasing that fits that person's situation, and varies its wording on every call.
// It only ever states facts found in the profile.

import { profileFacts, lowerFirst, stripEnd, cap, list, startsWithVerb } from './profile.mjs';
import { extractKeywords } from './ats.mjs';
import { resumeToText } from './constants.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const article = (w) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

function roleTitle(f, job) {
  const t = (job?.title || f.headline || f.currentRole || (f.field ? `${f.field} professional` : '')).trim();
  return t || 'professional';
}
// Skills the job asks for come first, so the summary leans toward the target role.
function rankedSkills(f, job) {
  const want = new Set(job?.description ? extractKeywords(job.description, 30) : []);
  return f.skills.slice().sort((a, b) => Number(want.has(b.toLowerCase())) - Number(want.has(a.toLowerCase())));
}

/* ---------------- summaries ---------------- */
function identity(f, title) {
  const n = f.years;
  if (f.level === 'none') {
    if (f.hasEducation && f.studying) return [`Final-year ${f.field || f.degree || 'university'} student${f.school ? ' at ' + f.school : ''}`, `${cap(f.field || 'Degree')} student${f.school ? ' at ' + f.school : ''}, preparing to start a career as ${article(title)} ${title}`];
    if (f.hasEducation) return [`${f.recentGrad ? 'Recent ' : ''}${f.field || f.degree} graduate${f.school ? ' from ' + f.school : ''}`, `${cap(f.field || f.degree)} graduate${f.school ? ' of ' + f.school : ''} starting out as ${article(title)} ${title}`, `Graduate${f.field ? ' in ' + f.field : ''} aiming for an entry-level ${title} role`];
    return [`Aspiring ${title}`, `Career starter aiming for ${article(title)} ${title} role`, `Motivated newcomer to the ${title} field`];
  }
  const at = f.currentCompany ? ` at ${f.currentCompany}` : '';
  if (f.level === 'junior') return [`${cap(title)} with ${n >= 1 ? n + ' year' + (n > 1 ? 's' : '') + ' of hands-on experience' : 'early hands-on experience'}`, `Early-career ${title}${at}`, `${cap(title)} building a record${at}`];
  if (f.level === 'mid') return [`${cap(title)} with ${n}+ years of experience${at ? ',' + at : ''}`, `Experienced ${title} with ${n}+ years in the field`, `${cap(title)}${at}, with ${n}+ years of practical experience`];
  return [`Senior ${title} with ${n}+ years of experience${f.employers.length > 1 ? ' across ' + f.employers.length + ' organisations' : ''}`, `${cap(title)} with over ${n} years of experience and a record of delivery`, `Seasoned ${title}, ${n}+ years in the field${at}`];
}
function evidence(f) {
  const a = f.achievements[0];
  if (a) return [`Notable results include: ${lowerFirst(a.text)}.`, `Career highlight: ${lowerFirst(a.text)}.`, `Proven in practice: ${lowerFirst(a.text)}.`];
  if (f.hasProjects) { const p = f.projects[0]; return [`Built ${p.name}${p.tech ? ' using ' + p.tech : ''}.`, `Hands-on project work includes ${p.name}.`]; }
  if (f.certs.length) { const c = f.certs[0]; return [`Holds ${c.name}${c.issuer ? ' (' + c.issuer + ')' : ''}.`, `Certified: ${c.name}.`]; }
  return [];
}
const skillLine = (s) => (s.length ? [`Skilled in ${list(s)}.`, `Core strengths: ${list(s)}.`, `Works confidently with ${list(s)}.`, `Hands-on with ${list(s)}.`] : []);
function goal(f, job, title) {
  if (job?.company && job?.title) return [`Keen to bring this to ${job.company} as ${article(job.title)} ${job.title}.`, `Looking to contribute to ${job.company} in the ${job.title} role.`];
  if (job?.title) return [`Looking to contribute as ${article(job.title)} ${job.title}.`, `Targeting ${job.title} roles.`];
  return f.level === 'none' ? [`Eager to learn quickly and contribute to a ${title} team.`, `Looking for a first ${title} role where I can learn and add value from day one.`.replace(' I ', ' ')] : [`Looking for ${article(title)} ${title} role with room to make a measurable difference.`, `Seeking the next ${title} challenge.`];
}
const manner = (f) => (f.level === 'none' ? ['Quick to learn, careful with detail and keen to take on responsibility.', 'Brings energy, curiosity and a willingness to learn on the job.'] : ['Known for a careful, organised approach and clear communication.', 'Combines analytical care with reliable follow-through.', 'Communicates clearly and follows work through to the end.']);

export function summaryOptions(content, job) {
  const f = profileFacts(content);
  const title = roleTitle(f, job);
  const skills = rankedSkills(f, job);
  const idn = shuffle(identity(f, title));
  const ev = shuffle(evidence(f));
  let rot = Math.floor(Math.random() * 3);
  const nextId = () => idn[rot++ % idn.length];
  const nextEv = () => ev[rot++ % Math.max(1, ev.length)];
  const sk = (n) => skillLine(skills.slice(0, n));
  const gl = shuffle(goal(f, job, title));
  const specs = [
    { label: 'Short and direct', parts: () => [`${nextId()}. ${pick(sk(3)) || ''}`] },
    { label: 'Balanced', parts: () => [`${nextId()}.`, nextEv() || pick(sk(3)), gl[0]] },
    { label: 'Detailed', parts: () => [`${nextId()}.`, nextEv(), pick(sk(4)), pick(manner(f)), gl[gl.length > 1 ? 1 : 0]] },
    { label: f.achievements.length ? 'Results first' : 'Skills first', parts: () => (f.achievements.length ? [nextEv(), `${nextId()}.`, gl[0]] : [pick(sk(4)) || pick(manner(f)), `${nextId()}.`, gl[0]]) },
    { label: 'Role-focused', parts: () => [`${cap(article(title))} ${title} ${f.level === 'none' ? 'in the making' : 'who gets things done'}.`, pick(sk(3)), nextEv(), gl[0]] },
  ];
  const seen = new Set();
  const out = [];
  for (const s of shuffle(specs).slice(0, 5)) {
    const text = s.parts().filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\.\./g, '.').trim();
    if (text && !seen.has(text)) { seen.add(text); out.push({ label: s.label, text, words: words(text) }); }
  }
  return out.sort((a, b) => a.words - b.words);
}

/* ---------------- bullets ---------------- */
const LEAD = [
  [/^(was\s+)?responsible for\s+/i, ['Managed', 'Handled', 'Ran']], [/^duties (included|were)\s+/i, ['Handled', 'Carried out', 'Managed']],
  [/^(was\s+)?(in charge of|tasked with)\s+/i, ['Managed', 'Oversaw', 'Handled']], [/^(helped|assisted)\s+(with|in)\s+/i, ['Supported', 'Contributed to', 'Assisted with']],
  [/^worked (on|with)\s+/i, ['Delivered', 'Developed', 'Contributed to']], [/^(was\s+)?involved in\s+/i, ['Contributed to', 'Took part in', 'Supported']],
];
const GERUND = { managing: 'Managed', handling: 'Handled', coordinating: 'Coordinated', preparing: 'Prepared', maintaining: 'Maintained', creating: 'Created', developing: 'Developed', building: 'Built', leading: 'Led', training: 'Trained', analysing: 'Analysed', analyzing: 'Analyzed', writing: 'Wrote', designing: 'Designed', organising: 'Organised', organizing: 'Organized', monitoring: 'Monitored', processing: 'Processed', serving: 'Served', selling: 'Sold', supporting: 'Supported', planning: 'Planned', reporting: 'Reported', improving: 'Improved', reconciling: 'Reconciled', tracking: 'Tracked', scheduling: 'Scheduled', answering: 'Answered', resolving: 'Resolved', testing: 'Tested', teaching: 'Taught', cleaning: 'Cleaned', cooking: 'Prepared' };
export function improveBullet(raw, present = false) {
  let s = stripEnd(String(raw || '').replace(/^[-•*\s]+/, ''));
  if (!s) return [''];
  let verbs = null;
  const hv = /^(helped|assisted)( to)?\s+(?!with\b|in\b)/i; // "helped reduce complaints": a verb follows
  if (hv.test(s)) { const r = s.replace(hv, ''); return [`Helped ${r}.`, `Supported efforts to ${r}.`, `Contributed to efforts to ${r}.`].map((x) => cap(x)); }
  for (const [re, vs] of LEAD) if (re.test(s)) { s = s.replace(re, ''); verbs = vs; break; }
  const first = s.split(/\s+/)[0]?.toLowerCase();
  if (GERUND[first]) { const v = GERUND[first]; s = s.split(/\s+/).slice(1).join(' '); verbs = [v, v]; }
  const rest = s;
  const fmt = (v) => `${v ? v + ' ' : ''}${rest}`.replace(/\s+/g, ' ').trim();
  const pastOf = (v) => (present ? v.replace(/ed$/, '').replace(/^Led$/, 'Lead') : v);
  const base = verbs ? verbs : [null];
  const out = [...new Set(base.map((v) => (v ? fmt(present && v === 'Managed' ? 'Manage' : v) : cap(rest))))];
  return out.map((t) => cap(t) + '.').filter((t) => t.length > 2);
}
export function bulletVariants(bullets, present = false) {
  return bullets.map((b) => {
    const v = improveBullet(b, present);
    const orig = cap(stripEnd(b)) + '.';
    const alts = v.length > 1 || !GERUND[String(b).trim().split(/\s+/)[0]?.toLowerCase()] ? [...new Set([...v, orig])] : v;
    return alts.slice(0, 3);
  });
}

/* ---------------- cover letter ---------------- */
// Skills the candidate lists that the job description also mentions, in the candidate's own wording.
function matchedKeywords(content, job) {
  if (!job?.description) return [];
  const jd = job.description.toLowerCase();
  return (content.skills || []).filter((s) => s && jd.includes(s.toLowerCase())).slice(0, 3);
}
// Keywords that look like skills (capitalised, acronyms, multi-word, or containing symbols), shown in the job's own casing.
function skillTerms(job, n = 12) {
  if (!job?.description) return [];
  const jd = job.description;
  const title = (job.title || '').toLowerCase();
  const out = [];
  for (const k of extractKeywords(jd, 25)) {
    if (title.split(/\W+/).includes(k)) continue;
    const m = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').exec(jd);
    const shown = m ? m[0] : k;
    if (k.includes(' ') || /[A-Z0-9+#]/.test(shown)) out.push(shown);
  }
  return out.slice(0, n);
}
const asI = (text) => (startsWithVerb(text) ? `I ${lowerFirst(text)}` : null);

export function coverLetter(content, job, tone = 'professional', country = 'US') {
  const f = profileFacts(content);
  const role = job?.title || '';
  const org = job?.company || '';
  const target = role ? `the ${role} ${org ? 'position at ' + org : 'position'}` : org ? `a role at ${org}` : 'the open position';
  const matched = matchedKeywords(content, job);
  const skills = rankedSkills(f, job).slice(0, 4);
  const p = [];

  // Opening: always about this person's real situation.
  if (f.level === 'none') {
    const kind = f.studying ? 'final-year' : '';
    const noun = f.studying ? 'student' : 'graduate';
    const sub = f.field || f.degree;
    const who = f.hasEducation ? `${article(kind || sub)} ${[kind, sub, noun].filter(Boolean).join(' ')}${f.school ? (f.studying ? ' at ' : ' from ') + f.school : ''}` : 'someone at the start of my career';
    p.push(pick([
      `I am writing to apply for ${target}. As ${who}, I am looking for the opportunity to turn my training into real work, and this role is exactly where I want to start.`,
      `Please accept my application for ${target}. I am ${who}, and I am keen to join a team where I can learn quickly and contribute from the start.`,
      `I would like to be considered for ${target}. I am ${who} and I am ready to bring my skills, effort and curiosity to your team.`,
    ]));
  } else {
    const exp = f.years >= 1 ? `${f.years}${f.level === 'senior' ? '+' : ''} year${f.years > 1 ? 's' : ''} of experience` : 'hands-on experience';
    const roleBit = f.currentRole ? ` as ${article(f.currentRole)} ${f.currentRole}` : '';
    const where = f.currentCompany ? ` at ${f.currentCompany}` : '';
    const nowBit = f.currentCompany ? (f.current?.current ? `, where I currently work` : `, where I most recently worked`) : '';
    p.push(pick([
      `I am writing to apply for ${target}. I bring ${exp}${roleBit}${where}${nowBit}, and I believe my background fits what you are looking for.`,
      `I would like to apply for ${target}. With ${exp}${roleBit}${where}, I can contribute from the first week.`,
      `Please consider my application for ${target}. My ${exp}${roleBit}${where} have prepared me well for this work.`,
    ]));
  }

  // Evidence: real achievements, projects, education or certifications, in that order of strength.
  if (f.hasExperience && f.achievements.length) {
    const picked = f.achievements.slice(0, 2);
    const sameCo = picked.length === 2 && picked[0].company && picked[0].company === picked[1].company;
    const lines = picked.map((a, i) => {
      const sentence = asI(a.text);
      const lead = a.company && !(sameCo && i === 1) ? `At ${a.company}, ` : '';
      return sentence ? `${lead}${i === 1 && sameCo ? sentence.replace(/^I /, 'I also ') : sentence}.` : `${lead}one result I am proud of is this: ${lowerFirst(a.text)}.`;
    });
    p.push(`${pick(['Some of what I have done:', 'A few examples from my work:', 'Two examples of the results I deliver:'])} ${lines.join(' ')}`.replace(/\s+/g, ' '));
  } else if (f.hasProjects) {
    const pr = f.projects[0];
    p.push(`${pick(['Through my studies and projects I have built practical skills.', 'My project work has given me practical, hands-on practice.'])} One example is ${pr.name}${pr.tech ? ' (' + pr.tech + ')' : ''}${pr.description ? ': ' + lowerFirst(stripEnd(pr.description)) : ''}.`);
  } else if (f.hasEducation) {
    p.push(`${f.eduName ? `My ${f.eduName}${f.school ? ' at ' + f.school : ''} gave me a solid grounding` : 'My studies gave me a solid grounding'}${f.eduDetails ? `, including ${lowerFirst(stripEnd(f.eduDetails))}` : ''}, and I am eager to apply it in a working environment.`);
  }
  if (f.certs.length && f.level === 'none') p.push(`I have also earned ${f.certs[0].name}${f.certs[0].issuer ? ' from ' + f.certs[0].issuer : ''}, which reflects my commitment to building real skills.`);

  // Fit: only skills the person actually lists, framed against what the job asks for.
  if (matched.length) p.push(pick([`The role calls for ${list(matched)}, and these are areas where I already have ${f.level === 'none' ? 'a foundation' : 'working experience'}${(() => { const more = skills.filter((s) => !matched.includes(s)).slice(0, 2); return more.length ? `, alongside ${list(more)}` : ''; })()}.`, `Your focus on ${list(matched)} matches the strengths on my CV.`]));
  else if (skills.length) p.push(`My strengths include ${list(skills)}, which I would put to use for your team.`);

  p.push(pick(tone === 'confident'
    ? ['I am confident I can add value quickly and would welcome the chance to discuss how.', 'I would like to talk about what I can deliver for your team.']
    : tone === 'warm'
      ? ['I would be delighted to talk with you about the role and how I could help. Thank you for taking the time to consider my application.', 'Thank you for your time and consideration. I would really enjoy the chance to speak with you.']
      : ['Thank you for considering my application. I would welcome the opportunity to discuss it further.', 'I would be glad to discuss my application in an interview. Thank you for your time.']));
  const paras = tone === 'concise' ? [p[0], p[p.length - 2] || p[1], p[p.length - 1]].filter(Boolean) : p;
  const formal = !['US', 'CA'].includes(country);
  return [formal ? 'Dear Sir/Madam,' : 'Dear Hiring Manager,', ...paras, `${formal ? 'Yours faithfully,' : 'Sincerely,'}\n${f.name || ''}`].join('\n\n');
}

/* ---------------- interview, roadmap, assistant ---------------- */
const BEHAVIOURAL = [
  ['Tell me about a time you had to learn something quickly.', 'Pick a real example, say how you learned it, and what you did with it afterwards.'],
  ['Describe a time something went wrong and how you handled it.', 'Own your part, explain the fix, and finish with what you changed so it did not happen again.'],
  ['How do you prioritise when everything seems urgent?', 'Describe the method you actually use, then give one real example.'],
  ['Tell me about a time you worked with someone who saw things differently.', 'Show that you listened first, then explain how you reached a result together.'],
  ['What is the piece of work you are proudest of, and why?', 'Choose something relevant to this job and explain your specific contribution.'],
];
export function interviewQuestions(content, job) {
  const f = profileFacts(content);
  const kws = skillTerms(job, 12);
  const text = resumeToText(content).toLowerCase();
  const have = kws.filter((k) => text.includes(k.toLowerCase()));
  const lack = kws.filter((k) => !text.includes(k.toLowerCase()));
  const qs = [];
  qs.push({ q: `Walk me through your background and why you want ${job?.title ? 'the ' + job.title + ' role' : 'this role'}.`, tip: f.level === 'none' ? `Start with your ${f.eduName || 'studies'}${f.school ? ' at ' + f.school : ''}, then your projects or skills, then why this job is the next step.` : `Cover ${f.currentRole ? 'your work as ' + f.currentRole : 'your recent work'}${f.currentCompany ? ' at ' + f.currentCompany : ''}, one highlight, and why this move makes sense.` });
  if (f.level === 'none') {
    qs.push({ q: `Tell me about a project or piece of coursework ${f.field ? 'in ' + f.field : ''} that you are proud of.`.replace('  ', ' '), tip: f.hasProjects ? `You list ${f.projects[0].name}. Explain the problem, what you did, and the result.` : 'Choose a real project, assignment or voluntary activity. Say what you did yourself.' });
    qs.push({ q: 'You have not held a full-time role yet. Why should we trust you with this one?', tip: 'Be honest about being new, then point to evidence of reliability: projects, studies, certificates, volunteering.' });
  } else {
    qs.push({ q: `At ${f.currentCompany || 'your last job'}, what was the most important thing you delivered?`, tip: f.achievements[0] ? `You wrote: "${f.achievements[0].text}". Be ready to explain how you did it and how you measured it.` : 'Pick a real result and be ready to give numbers or a clear before and after.' });
  }
  for (const k of have.slice(0, 2)) qs.push({ q: `Tell me about a time you used ${k}.`, tip: 'Use Situation, Task, Action, Result. End with what changed because of your work.' });
  for (const k of lack.slice(0, 2)) qs.push({ q: `The role mentions ${k}. How would you get up to speed?`, tip: `Do not pretend. Say what you do know that is close, and how you would learn ${k} in the first weeks.` });
  for (const [q, tip] of shuffle(BEHAVIOURAL).slice(0, 3)) qs.push({ q, tip });
  qs.push({ q: 'What questions do you have for us?', tip: 'Ask what success looks like in the first 90 days and how the team works together.' });
  return qs.slice(0, 9);
}

export function roadmapSteps(missing, content) {
  const f = profileFacts(content);
  return missing.slice(0, 6).map((k, i) => {
    const tool = /^[a-z0-9+#.]+$/i.test(k) && !k.includes(' ');
    const plan = tool
      ? pick([`Do a free beginner course in ${k}, then redo one piece of your own work using it. Add that result to your CV.`, `Spend a week on the official ${k} tutorial, then build one small thing with it and describe it in a bullet.`, `Find a short ${k} certificate course, finish it, and list it under Certifications.`])
      : pick([`Write down two real situations that involve ${k}, then add a bullet for each to your CV. If you have none, volunteer for one.`, `Read two good guides on ${k}, then practise by applying it to a task you already do.`]);
    return { skill: k, weeks: 2 + (i % 3) * 2 + (f.level === 'none' ? 1 : 0), plan };
  });
}

export function assistantReply(message, content, job) {
  const m = message.toLowerCase();
  const f = profileFacts(content);
  if (/summary|profile|about me/.test(m)) { const o = summaryOptions(content, job)[1] || summaryOptions(content, job)[0]; return `Here is a summary to start from:\n\n${o.text}\n\nEdit anything that is not true for you. Use "Write with AI" on your profile for more versions.`; }
  if (/interview/.test(m)) return `Likely questions to prepare:\n${interviewQuestions(content, job).slice(0, 4).map((x) => '- ' + x.q).join('\n')}\n\nThe Interview prep tool gives tips for each one.`;
  if (/no experience|first job|graduate|fresh/.test(m)) return `Without work history, lead with ${f.hasEducation ? 'your education' : 'your skills'}, then projects, certificates and volunteering. Show what you built or finished, and name the tools you used. A short summary that says what role you want is better than a long one.`;
  if (/cover letter|letter/.test(m)) return 'Open the Cover letters page, pick a resume, paste the job description and generate a draft. It only uses what is on your CV, so a complete profile gives a better letter.';
  if (/salary|pay/.test(m)) return 'Look up the typical range for this role in your city, decide a number you would be happy with, and give a range rather than one figure. I can help you practise the wording.';
  return 'I can help with your summary, bullet points, cover letter, interview questions and what to do when you have little experience. Ask me about any of those. The full AI assistant is busy right now, so try again in a moment for a more detailed answer.';
}
