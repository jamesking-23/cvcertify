import test from 'node:test';
import assert from 'node:assert/strict';

const { INTENTS, classify, buildIndex, DEFAULT_THRESHOLD, normalize } = await import('../supabase/functions/cvc-api/router.mjs');
const A = await import('../supabase/functions/cvc-api/actions.mjs');
const ai = await import('../supabase/functions/cvc-api/ai.mjs');

const content = {
  personal: { fullName: 'James Amani', email: 'j@x.com', phone: '+256700000000', headline: 'Operations Analyst', location: 'Kampala' },
  summary: '', skills: ['Excel', 'SQL'],
  experience: [{ id: 'a1', role: 'Operations Analyst', company: 'Nile Logistics', start: '2022-03', end: '', current: true, bullets: ['Cut delivery delays by 18%.'] }],
  education: [{ id: 'e1', school: 'Makerere University', degree: 'BSc', field: 'Statistics', start: '2017-08', end: '2021-06' }],
  projects: [], certifications: [], languages: [], referees: [], footnote: '', options: { showPersonal: false },
};
const ask = (m, c = content, o) => A.handleMessage(m, { content: c }, o);

test('every intent has 5-8 example phrases and a matching deterministic action', () => {
  for (const [k, v] of Object.entries(INTENTS)) {
    assert.ok(v.length >= 5 && v.length <= 8, `${k} has ${v.length} phrases`);
    assert.equal(typeof A.ACTIONS[k]?.run, 'function', k);
  }
  assert.deepEqual(Object.keys(A.ACTIONS).sort(), Object.keys(INTENTS).sort());
});

test('the bank covers slang, broken grammar and formal requests', () => {
  const all = Object.values(INTENTS).flat().join(' | ');
  for (const w of ['oli otya', 'wagwan', 'nkozese ntya', 'how i can write summary', 'summary of my cv make']) assert.ok(all.includes(w), w);
});

test('requests in different registers reach the right action', () => {
  const cases = [
    ['hello', 'greet_user'], ['oli otya', 'greet_user'], ['wagwan', 'greet_user'], ['what can you do', 'help_menu'],
    ['please write me a summary', 'write_summary'], ['summary my cv write', 'write_summary'],
    ['write a cover letter for data analyst', 'write_cover_letter'], ['draft application letter please', 'write_cover_letter'],
    ['does my cv pass ats', 'ats_score'], ['prepare me for interview', 'interview_questions'], ['what skills am i missing', 'skill_roadmap'],
    ['how complete is my cv', 'profile_completeness'], ['how many years have i worked', 'years_experience'],
    ['which template is best for me', 'template_info'], ['cv format for uganda', 'country_format'], ['i have no experience', 'no_experience_tips'],
    ['how does verification work', 'verify_info'], ['can i share my page', 'portfolio_info'], ['what salary should i ask', 'salary_tip'],
  ];
  for (const [q, intent] of cases) {
    const r = ask(q);
    assert.equal(r.intent, intent, `${q} -> ${r.intent} (${r.confidence.toFixed(2)})`);
    assert.ok(r.matched && r.confidence >= DEFAULT_THRESHOLD, q);
  }
});

test('gibberish and open-ended chat fall back politely and point to supported commands', () => {
  for (const q of ['asdkjh qwe', 'tell me a joke', 'what is the capital of france', 'who won the world cup', 'play some music', 'bitcoin price', '']) {
    const r = ask(q);
    assert.equal(r.matched, false, q);
    assert.equal(r.intent, null);
    assert.match(r.reply, /help/i);
    assert.match(r.reply, /cover letter|profile|interview/i);
  }
});

test('the confidence threshold is configurable', () => {
  const q = 'please tell me what you can help with';
  assert.equal(ask(q, content, { minConfidence: 0.99 }).matched, false);
  assert.equal(ask(q, content, { minConfidence: 0.3 }).matched, true);
});

test('matching is fast: under 15 ms per message', () => {
  classify('warm up');
  const t = performance.now();
  for (let i = 0; i < 200; i++) classify('please write me a cover letter for the accountant job');
  const per = (performance.now() - t) / 200;
  assert.ok(per < 15, `${per.toFixed(2)} ms per message`);
});

test('greetings vary and use a warm tone; help lists every real command', () => {
  const seen = new Set(Array.from({ length: 60 }, () => ask('hello').reply));
  assert.ok(seen.size >= 3, 'greetings should vary');
  const help = ask('help').reply;
  for (const [k, a] of Object.entries(A.ACTIONS)) if (!['greet_user', 'help_menu'].includes(k)) assert.ok(help.includes(a.title), `help is missing ${k}`);
});

test('parameters come out of the message with regular expressions, and missing ones are asked for', () => {
  assert.equal(A.extractCountry('cv format in Uganda').id, 'AF');
  assert.equal(A.extractCountry('how should my cv look in canada').id, 'CA');
  assert.equal(A.extractCountry('something else'), null);
  assert.deepEqual(A.extractJob('write a cover letter for Data Analyst at MTN Uganda'), { title: 'Data Analyst', company: 'MTN Uganda' });
  assert.equal(A.extractJob('write a cover letter for me').title, '');
  assert.equal(A.extractPayload('improve this bullet: led a team of 5'), 'led a team of 5');
  assert.match(ask('write a cover letter please').reply, /Which job is it for/);
  assert.match(ask('improve this bullet').reply, /Send me the line/);
  assert.match(ask('ats score').reply, /paste/i);
  assert.match(ask('cv format for my country').reply, /Which country/);
});

test('actions compute from the profile, deterministically', () => {
  assert.match(ask('how many years of experience do i have').reply, /about \d+ years? of experience across 1 role/);
  assert.match(ask('how complete is my profile').reply, /\d+% complete/);
  assert.match(ask('cv format in Uganda').reply, /Date of birth: commonly included/);
  const letter = ask('write a cover letter for Data Analyst at MTN Uganda').reply;
  assert.match(letter, /Data Analyst/);
  assert.match(letter, /Nile Logistics/);
  const ats = ask('ats score: We need an analyst skilled in SQL, Excel, Power BI and stakeholder management for data analysis work.').reply;
  assert.match(ats, /scores \d+\/100/);
  assert.match(ask('improve this bullet: was responsible for handling customer complaints').reply, /Managed|Handled|Ran/);
});

test('an empty profile gets a clear instruction, never made-up writing', () => {
  const empty = { personal: {}, summary: '', skills: [], experience: [], education: [], projects: [], certifications: [], languages: [], referees: [] };
  assert.match(ask('write my professional summary', empty).reply, /profile is empty/i);
  assert.match(ask('write a cover letter for Data Analyst', empty).reply, /profile is empty/i);
});

test('nothing here touches the network and no AI key is read', async () => {
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('network is off'); };
  process.env.GEMINI_API_KEY = 'x'; process.env.OPENAI_API_KEY = 'x';
  try {
    assert.equal((await ai.assistant({ message: 'hello', content })).mode, 'local');
    assert.ok((await ai.writeSummary({ content, job: null })).options.length > 0);
    assert.ok((await ai.writeCoverLetter({ content, job: { title: 'Analyst', company: '', description: 'x'.repeat(50), notes: '' }, tone: 'warm', country: 'UK' })).letter.includes('Yours faithfully'));
    assert.equal(ai.aiEnabled(), false);
  } finally { globalThis.fetch = real; delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY; }
  assert.equal(calls, 0);
});

test('normalising text handles case, punctuation and apostrophes', () => {
  assert.equal(normalize("  What's   MY  score?!  "), 'whats my score');
  assert.ok(buildIndex() > 80);
});

test('help with a named interview question gives a profile-based answer', () => {
  const r = ask('Help me answer “Tell me about yourself”.', content);
  assert.equal(r.intent, 'answer_interview_question');
  assert.match(r.reply, /present, past, future/i);
  assert.equal(ask('how do i answer why should we hire you', content).intent, 'answer_interview_question');
});

test('calculations are parsed and solved without eval', () => {
  assert.match(ask('what is 15% of 2,400,000').reply, /= 360,000/);
  assert.match(ask('2+2').reply, /= 4$/);
  assert.match(ask('calculate 850000 + 120000 * 3').reply, /= 1,210,000/);
  assert.equal(A.extractMath('process.exit(1)'), null);
  assert.equal(ask('what is the capital of france').matched, false);
});

test('Tier 1 router works with any embedder and returns the query vector for Tier 2', async () => {
  const { createRouter, hashedEmbedder } = await import('../supabase/functions/cvc-api/tier1.mjs');
  const r = createRouter(hashedEmbedder);
  await r.ready;
  const hit = await r.handle('hello', { content });
  assert.equal(hit.intent, 'greet_user');
  const miss = await r.handle('explain how photosynthesis works', { content });
  assert.equal(miss.matched, false);
  assert.ok(miss.embedding?.length > 0, 'a miss keeps its embedding so the cache can reuse it');
});
