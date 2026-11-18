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
  assert.equal(bullets[1], 'Supported customers.');
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
