import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.CVC_DB_FILE = path.join(os.tmpdir(), `cvc-unit-${process.pid}.json`);
process.env.SESSION_SECRET = 'unit-test-secret-0123456789';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.NETLIFY_DATABASE_URL;

const { scoreResume, extractKeywords } = await import('../netlify/lib/ats.mjs');
const { cleanContent } = await import('../netlify/lib/schema.mjs');
const { newDocId, normalizeDocId, stableStringify } = await import('../netlify/lib/util.mjs');
const { hashPassword, verifyPassword, signToken, verifyToken } = await import('../netlify/lib/auth.mjs');
const { handle } = await import('../netlify/lib/handlers.mjs');
const ai = await import('../netlify/lib/ai.mjs');

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

test('document IDs are well formed and normalise typos', () => {
  const id = newDocId();
  assert.match(id, /^CVC-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
  assert.equal(normalizeDocId(id.toLowerCase().replace(/-/g, ' ')), id);
  assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
});

test('passwords hash and verify; tokens expire and reject tampering', async () => {
  const h = await hashPassword('correct horse');
  assert.ok(await verifyPassword('correct horse', h));
  assert.ok(!(await verifyPassword('wrong', h)));
  assert.ok(!(await verifyPassword('x', null)));
  const t = signToken({ sub: 'u1' }, 60);
  assert.equal(verifyToken(t).sub, 'u1');
  assert.equal(verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(verifyToken(signToken({ sub: 'u1' }, -5)), null);
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

test('auth: signup, duplicate email, login, wrong password, protected routes', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Test User', email: 'T@Example.com', password: 'longenough1' });
  assert.equal(s.status, 201);
  assert.ok(s.cookie.startsWith('cv_session='));
  assert.equal((await call('POST', '/api/auth/signup', { name: 'x', email: 't@example.com', password: 'longenough1' })).status, 409);
  assert.equal((await call('POST', '/api/auth/signup', { name: 'x', email: 'bad', password: 'longenough1' })).status, 400);
  assert.equal((await call('POST', '/api/auth/signup', { name: 'x', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await call('POST', '/api/auth/login', { email: 't@example.com', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 't@example.com', password: 'longenough1' })).status, 200);
  assert.equal((await call('GET', '/api/profile')).status, 401);
  assert.equal((await call('GET', '/api/me', null, s.cookie)).data.user.email, 't@example.com');
});

test('plans: starter limits are enforced; upgrading unlocks features', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Plan User', email: 'plan@example.com', password: 'longenough1' });
  const c = s.cookie;
  assert.equal((await call('POST', '/api/resumes', { title: 'one' }, c)).status, 201);
  assert.equal((await call('POST', '/api/resumes', { title: 'two' }, c)).status, 201);
  const third = await call('POST', '/api/resumes', { title: 'three' }, c);
  assert.equal(third.status, 402);
  assert.equal(third.data.code, 'quota_exceeded');
  const ats = await call('POST', '/api/ai/ats', { content: {}, job: { description: JD } }, c);
  assert.equal(ats.status, 402);
  // AI rewrite quota: 3 per month
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', '/api/ai/bullets', { bullets: ['did stuff'] }, c)).status, 200);
  assert.equal((await call('POST', '/api/ai/bullets', { bullets: ['did stuff'] }, c)).data.code, 'quota_exceeded');
  assert.equal((await call('POST', '/api/me/plan', { plan: 'professional' }, c)).status, 200);
  assert.equal((await call('POST', '/api/resumes', { title: 'three' }, c)).status, 201);
  assert.equal((await call('POST', '/api/ai/ats', { content: {}, job: { description: JD } }, c)).status, 200);
});

test('certify: issue, public verify, detect edits, revoke', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Cert User', email: 'cert@example.com', password: 'longenough1' });
  const c = s.cookie;
  const { data: { resume } } = await call('POST', '/api/resumes', { title: 'R' }, c);
  const issued = await call('POST', `/api/resumes/${resume.id}/certify`, null, c);
  const id = issued.data.resume.docId;
  assert.match(id, /^CVC-/);
  assert.equal((await call('POST', `/api/resumes/${resume.id}/certify`, null, c)).data.unchanged, true);
  const pub = await call('GET', '/api/verify/' + id.toLowerCase());
  assert.equal(pub.data.status, 'valid');
  assert.equal(pub.data.holder, 'Cert User');
  assert.equal(pub.data.snapshot.email, undefined, 'private contact details must not be public');
  const edit = await call('PUT', '/api/resumes/' + resume.id, { content: { ...resume.content, summary: 'Changed after certification' } }, c);
  assert.equal(edit.data.changedSinceCertified, true);
  assert.equal((await call('POST', `/api/resumes/${resume.id}/certify`, null, c)).data.resume.docId, id, 're-certify keeps the same ID');
  assert.equal((await call('POST', `/api/resumes/${resume.id}/revoke`, null, c)).status, 200);
  assert.equal((await call('GET', '/api/verify/' + id)).data.status, 'revoked');
  assert.equal((await call('GET', '/api/verify/CVC-ZZZZ-ZZZZ-ZZZZ')).status, 404);
});

test('authorisation: users cannot read or change each other\'s data', async () => {
  const a = await call('POST', '/api/auth/signup', { name: 'A', email: 'a1@example.com', password: 'longenough1' });
  const b = await call('POST', '/api/auth/signup', { name: 'B', email: 'b1@example.com', password: 'longenough1' });
  const { data: { resume } } = await call('POST', '/api/resumes', { title: 'private' }, a.cookie);
  assert.equal((await call('GET', '/api/resumes/' + resume.id, null, b.cookie)).status, 404);
  assert.equal((await call('PUT', '/api/resumes/' + resume.id, { title: 'hax' }, b.cookie)).status, 404);
  assert.equal((await call('DELETE', '/api/resumes/' + resume.id, null, b.cookie)).status, 404);
  assert.equal((await call('POST', `/api/resumes/${resume.id}/certify`, null, b.cookie)).status, 404);
  assert.equal((await call('GET', `/api/resumes/${resume.id}/export`, null, b.cookie)).status, 404);
});

test('docx export produces a valid Word file', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Doc User', email: 'doc@example.com', password: 'longenough1' });
  const { data: { resume } } = await call('POST', '/api/resumes', { title: 'D', template: 'modern' }, s.cookie);
  const r = await call('GET', `/api/resumes/${resume.id}/export`, null, s.cookie);
  assert.equal(r.status, 200);
  assert.equal(Buffer.from(r.data).subarray(0, 2).toString(), 'PK');
});

test('account deletion removes data and revokes issued IDs', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Gone', email: 'gone@example.com', password: 'longenough1' });
  const { data: { resume } } = await call('POST', '/api/resumes', { title: 'G' }, s.cookie);
  const id = (await call('POST', `/api/resumes/${resume.id}/certify`, null, s.cookie)).data.resume.docId;
  assert.equal((await call('DELETE', '/api/me', { confirm: 'wrong' }, s.cookie)).status, 400);
  assert.equal((await call('DELETE', '/api/me', { confirm: 'gone@example.com' }, s.cookie)).status, 200);
  assert.equal((await call('GET', '/api/verify/' + id)).data.status, 'revoked');
  assert.equal((await call('POST', '/api/auth/login', { email: 'gone@example.com', password: 'longenough1' })).status, 401);
});

test('public plan flags: features are booleans, only quotas may be null (unlimited)', async () => {
  const s = await call('POST', '/api/auth/signup', { name: 'Flags', email: 'flags@example.com', password: 'longenough1' });
  assert.equal(s.data.user.plan.limits.letters, false);
  const up = await call('POST', '/api/me/plan', { plan: 'professional' }, s.cookie);
  const l = up.data.user.plan.limits;
  assert.equal(l.letters, true);
  assert.equal(l.ats, true);
  assert.equal(l.resumes, null);
  assert.equal(l.rewrites, null);
  assert.equal(l.roadmap, false);
});
