import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

delete process.env.ANTHROPIC_API_KEY;

const { scoreResume, extractKeywords } = await import('../supabase/functions/cvc-api/ats.mjs');
const { cleanContent } = await import('../supabase/functions/cvc-api/clean.mjs');
const ai = await import('../supabase/functions/cvc-api/ai.mjs');

const JD = `We are hiring a Data Analyst. You will build dashboards in Power BI, write SQL queries, and use Python for data analysis.
Experience with stakeholder management and Excel is required. Knowledge of machine learning is a plus.`;

test('keyword extraction finds skills and phrases, ignores filler', () => {
  const k = extractKeywords(JD);
  for (const w of ['sql', 'python', 'excel', 'power bi', 'data analysis', 'machine learning', 'stakeholder management']) assert.ok(k.includes(w), `missing ${w}: ${k}`);
  assert.ok(!k.includes('the') && !k.includes('required'));
});

test('ATS score rises when matching skills are added', () => {
  const base = cleanContent({ personal: { fullName: 'A B', email: 'a@b.co', phone: '1' }, summary: 'Friendly person who likes teamwork and learning new things every day at work.', skills: ['Cooking'] });
  const good = cleanContent({ ...base, skills: ['SQL', 'Python', 'Excel', 'Power BI', 'Data analysis'], experience: [{ role: 'Analyst', company: 'X', start: '2020-01', current: true, bullets: ['Built Power BI dashboards used by 40 managers', 'Cut reporting time by 30% using SQL and Python'] }] });
  const a = scoreResume(base, JD);
  const b = scoreResume(good, JD);
  assert.ok(b.score > a.score + 20, `${a.score} -> ${b.score}`);
  assert.ok(b.matched.includes('sql'));
  assert.ok(a.missing.includes('sql'));
});

test('cleanContent drops unknown fields, caps sizes and sanitises dates', () => {
  const c = cleanContent({ evil: '<script>', personal: { fullName: 'x'.repeat(999), hack: 1 }, experience: [{ role: 'R', start: 'nope', end: '2021', bullets: ['a', '', 'b'] }], skills: Array(500).fill('s') });
  assert.equal(c.evil, undefined);
  assert.equal(c.personal.hack, undefined);
  assert.equal(c.personal.fullName.length, 200);
  assert.equal(c.experience[0].start, '');
  assert.equal(c.experience[0].end, '2021-01');
  assert.deepEqual(c.experience[0].bullets, ['a', 'b']);
  assert.equal(c.skills.length, 80);
});

test('basic-mode AI never invents facts', async () => {
  const { bullets } = await ai.rewriteBullets({ bullets: ['responsible for the till', 'helped customers'], role: 'Cashier', company: 'Shop' });
  assert.equal(bullets[0], 'Managed the till.');
  assert.match(bullets[1], /^(Helped|Supported|Assisted)\b.*customers\.$/);
});

/* ---------- API integration (in-process, file db) ---------- */
const call = async (method, p, body, cookie) => {
  const res = await handle(new Request('http://localhost' + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, data: ct.includes('json') ? await res.json() : await res.arrayBuffer(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
};


test('shared modules are identical in the browser and the Edge Function', () => {
  execFileSync('node', ['scripts/sync-function.mjs', '--check'], { stdio: 'pipe' });
});

test('plan limits: resume/rewrite quotas are numbers or null, features are booleans', async () => {
  const { PLANS } = await import('../public/js/shared/constants.js');
  for (const p of Object.values(PLANS)) {
    for (const k of ['ats', 'interview', 'roadmap', 'portfolio']) assert.equal(typeof p.limits[k], 'boolean', `${p.id}.${k}`);
  }
});

test('letter parsing separates salutation, body and sign-off so each layout can place them', async () => {
  const { parseLetter, letterParts } = await import('../public/js/preview.js');
  const text = 'Dear Sir/Madam,\n\nFirst paragraph.\n\nSecond paragraph.\n\nYours faithfully,\nJames Amani';
  const p = parseLetter(text);
  assert.equal(p.salutation, 'Dear Sir/Madam,');
  assert.deepEqual(p.paragraphs, ['First paragraph.', 'Second paragraph.']);
  assert.equal(p.signed, 'James Amani');
  const L = letterParts({ text, personal: { fullName: 'James Amani', email: 'j@example.com' }, job: { title: 'Analyst', company: 'Acme' }, date: new Date(2026, 10, 19) });
  assert.equal(L.subject, 'RE: APPLICATION FOR THE POSITION OF ANALYST');
  assert.equal(L.closing, 'Yours faithfully,');
  assert.equal(L.date, '19 November 2026');
  assert.equal(letterParts({ text: 'Dear Ms Okello,\n\nHi.', job: {} }).closing, 'Yours sincerely,');
});

test('every template and letter format id is registered, and everything is free', async () => {
  const { TEMPLATES, LETTER_FORMATS, PLANS } = await import('../public/js/shared/constants.js');
  for (const id of ['classic', 'modern', 'compact', 'executive', 'academic', 'timeline', 'rail']) assert.ok(TEMPLATES.some((t) => t.id === id), id);
  assert.deepEqual(LETTER_FORMATS.map((f) => f.id), ['formal', 'right', 'letterhead']);
  assert.deepEqual(Object.keys(PLANS), ['starter']);
  assert.equal(PLANS.starter.price, 0);
  assert.equal(PLANS.starter.limits.roadmap, true);
});

// ---- AI writer (offline engine) ----
const { emptyContent } = await import('../supabase/functions/cvc-api/constants.js');
const grad = () => {
  const c = emptyContent();
  c.personal.fullName = 'Mary Achieng'; c.personal.headline = 'Data Analyst';
  c.education = [{ school: 'Makerere University', degree: 'BSc', field: 'Statistics', start: '2021-08', end: '2025-06', details: '' }];
  c.skills = ['Excel', 'SQL', 'R'];
  c.projects = [{ name: 'Boda boda demand dashboard', tech: 'Power BI', description: 'Visualised ride demand by hour' }];
  return c;
};
const AIJOB = { title: 'Data Analyst', company: 'Lakeshore Freight', description: 'We need a data analyst with SQL, Excel and dashboard skills to report weekly KPIs.' };

test('cover letter never claims work history the candidate does not have', async () => {
  for (const tone of ['professional', 'warm', 'confident', 'concise']) {
    for (let i = 0; i < 5; i++) {
      const { letter } = await ai.writeCoverLetter({ content: grad(), job: AIJOB, tone, country: 'AF' });
      assert.ok(!/I worked as|years of experience|my previous role|in my role at/i.test(letter), letter);
      assert.ok(/Makerere|Statistics/.test(letter), 'should lean on education');
    }
  }
});

test('summary suggestions come in several labelled lengths and vary between requests', async () => {
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const out = await ai.writeSummary({ content: grad(), job: AIJOB });
    assert.ok(out.options.length >= 4);
    assert.ok(out.options.every((o) => o.label && o.text && o.words > 5));
    assert.ok(Math.max(...out.options.map((o) => o.words)) > Math.min(...out.options.map((o) => o.words)) + 8, 'short and long mix');
    out.options.forEach((o) => seen.add(o.text));
  }
  assert.ok(seen.size >= 12, `only ${seen.size} distinct summaries`);
});

test('bullet rewrite returns grammatical variants without inventing numbers', async () => {
  const out = await ai.rewriteBullets({ bullets: ['Responsible for dispatch scheduling', 'helped reduce customer complaints'], role: 'x', company: 'y' });
  assert.equal(out.variants.length, 2);
  for (const v of out.variants.flat()) { assert.ok(!/\d/.test(v), v); assert.ok(!/^responsible\b/i.test(v), v); }
});

test('ATS keywords drop filler words and fragments of matched phrases', async () => {
  const { extractKeywords } = await import('../supabase/functions/cvc-api/ats.mjs');
  const k = extractKeywords('We need a Data Analyst skilled in SQL, Excel and Power BI for data analysis. Experience building dashboards is essential.');
  for (const bad of ['essential', 'skilled', 'building', 'data']) assert.ok(!k.includes(bad), bad);
  for (const good of ['data analysis', 'power bi', 'sql', 'excel', 'dashboards']) assert.ok(k.includes(good), good);
});
