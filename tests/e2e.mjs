// Browser smoke test. Supabase is replaced by an in-test fake (network interception), so this checks that the
// UI boots under hash routing, sign-up/sign-in/resume/verify flows render, and no script errors occur.
// It cannot prove the real database rules; those were verified with SQL scenarios against the live project.
import { chromium } from 'playwright';
import { createServer } from '../scripts/serve.mjs';
import assert from 'node:assert/strict';

const SHOTS = process.env.SHOTS_DIR;
const server = createServer();
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const db = { user: null, profile: null, resumes: [] };
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const emptyProfile = (name, email) => ({ personal: { fullName: name, headline: '', email, phone: '', location: '', website: '', linkedin: '', github: '', dob: '', nationality: '' }, summary: '', experience: [], education: [], projects: [], skills: [], certifications: [], languages: [], referees: [] });
const me = () => ({ id: 'u1', name: db.user.name, email: db.user.email, country: 'US', createdAt: new Date().toISOString(), plan: { id: 'starter', name: 'Starter', limits: { resumes: 2, rewrites: 3, letters: false, ats: false, interview: false, roadmap: false, portfolio: false }, usage: { month: '2026-11', rewrites: 0 } } });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));

await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await ctx.route('https://dgvaoswcbzzcyaentjwr.supabase.co/**', async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (p === '/auth/v1/settings') return json(route, 200, { external: { google: false }, disable_signup: false });
  if (p === '/auth/v1/signup') { db.user = { name: body.data.name, email: body.email }; return json(route, 200, { access_token: 'a.b.c', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', email: body.email } }); }
  if (p === '/auth/v1/logout') return json(route, 204, {});
  if (p === '/rest/v1/rpc/cvc_config') return json(route, 200, { selfServePlans: true });
  if (p === '/rest/v1/rpc/cvc_ensure_account' || p === '/rest/v1/rpc/cvc_me') { db.profile ||= emptyProfile(db.user.name, db.user.email); return json(route, 200, me()); }
  if (p === '/rest/v1/cvc_profiles') return json(route, 200, req.method() === 'GET' ? [{ content: db.profile }] : []);
  if (p === '/rest/v1/cvc_resumes') {
    if (req.method() === 'POST') { const r = { id: 'r1', ...body, doc_id: null, certified_at: null, certified_hash: null, current_hash: 'h', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; db.resumes = [r]; return json(route, 201, [r]); }
    return json(route, 200, db.resumes.map((r) => ({ ...r, name: r.content.personal.fullName })));
  }
  if (p === '/rest/v1/rpc/cvc_verify') return json(route, 200, body.p_id.includes('GOOD') ? { id: 'CVC-GOOD-0000-0000', status: 'valid', holder: 'Jane Doe', headline: '', kind: 'resume', issuedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: 1, snapshot: { fullName: 'Jane Doe', experience: [], education: [], certifications: [], skills: [] }, note: 'n' } : null);
  return json(route, 404, { message: 'unmocked ' + p });
});

try {
  await page.goto(base + '/');
  await page.getByRole('link', { name: 'Get started' }).first().waitFor();
  assert.match(page.url(), /\/$/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/01-landing.png` });

  await page.getByRole('link', { name: 'Get started' }).first().click();
  await page.waitForURL(/#\/signup/);
  await page.getByLabel('Full name').fill('Jane Doe');
  await page.getByLabel('Email').fill('jane@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/#\/app\/profile/);
  await page.getByRole('heading', { name: /master profile/i }).waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/02-profile.png` });

  await page.goto(base + '/#/app/resumes');
  await page.getByRole('heading', { name: 'Resumes' }).first().waitFor();

  await page.goto(base + '/#/verify/CVC-GOOD-0000-0000');
  await page.getByText('Jane Doe').first().waitFor();
  await page.goto(base + '/#/verify/CVC-NOPE-0000-0000');
  await page.getByText('Document not found').waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/03-verify.png` });

  await page.goto(base + '/#/does-not-exist');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  assert.deepEqual(errors, [], 'no script errors: ' + errors.join(' | '));
  console.log('e2e smoke passed');
} catch (e) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
