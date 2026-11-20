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

const db = { auto: false, manualRows: [], onlineOff: false, user: null, profile: null, resumes: [], admin: false, plan: 'starter', expires: null, codes: [] };
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const emptyProfile = (name, email) => ({ personal: { fullName: name, headline: '', email, phone: '', location: '', website: '', linkedin: '', github: '', dob: '', nationality: '' }, summary: '', experience: [], education: [], projects: [], skills: [], certifications: [], languages: [], referees: [] });
const PAID = { resumes: 1e12, rewrites: 1e12, letters: true, ats: true, interview: true, roadmap: false, portfolio: false };
const me = () => ({ id: 'u1', name: db.user.name, email: db.user.email, country: 'US', createdAt: new Date().toISOString(), isAdmin: db.admin, plan: db.plan === 'starter'
  ? { id: 'starter', name: 'Starter', limits: { resumes: 2, rewrites: 3, letters: false, ats: false, interview: false, roadmap: false, portfolio: false }, usage: { month: '2026-11', rewrites: 0 } }
  : { id: 'professional', name: 'Professional', expiresAt: db.expires, limits: PAID, usage: { month: '2026-11', rewrites: 0 } } });

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
  if (p === '/rest/v1/rpc/cvc_track') return json(route, 204, {});
  if (p === '/rest/v1/cvc_payments') return json(route, 200, []);
  if (p === '/rest/v1/rpc/cvc_redeem') {
    if (body.p_code.replace(/\W/g, '').toUpperCase() !== 'CVCGOODAAAABBBB') return json(route, 200, { error: 'bad_code', message: 'That code is not valid, or it has expired or been used up.' });
    db.plan = 'professional'; db.expires = new Date(Date.now() + 30 * 864e5).toISOString(); return json(route, 200, me());
  }
  if (p === '/functions/v1/cvc-pay') {
    if (body.task === 'config') return json(route, 200, { enabled: !db.onlineOff });
    if (body.task === 'checkout') return json(route, 200, { link: base + '/#/pay-mock?m=' + body.months, txRef: 'cvc_' + 'a'.repeat(32), amount: 2500 * body.months, currency: 'UGX' });
    if (body.task === 'verify') { db.plan = 'professional'; db.expires = new Date(Date.now() + 30 * 864e5).toISOString(); return json(route, 200, { status: 'succeeded', plan: 'professional' }); }
  }
  if (p === '/rest/v1/rpc/cvc_admin_stats') return db.admin ? json(route, 200, { days: body.p_days, totals: { users: 5, paying: 1, resumes: 3, letters: 1, certified: 1, aiRewritesThisMonth: 4, revenueAllTime: 7500 }, period: { newUsers: 2, visitors: 40, views: 90, signups: 0, payments: 1, revenue: 2500, redemptions: 1 }, plans: [{ plan: 'starter', count: 4 }], countries: [{ country: 'AF', count: 5 }], daily: [{ day: '2026-11-18', visitors: 10, views: 20, signups: 1, revenue: 0 }, { day: '2026-11-19', visitors: 30, views: 70, signups: 1, revenue: 2500 }], topPages: [{ path: '/', views: 50 }], topReferrers: [{ ref: 'google.com', visitors: 12 }] }) : json(route, 400, { message: 'Not authorised.', hint: 'forbidden' });
  if (p === '/rest/v1/rpc/cvc_submit_manual_payment') {
    if (!/^[A-Z0-9]{6,}$/i.test(body.p_ref.replace(/[^A-Za-z0-9]/g, ''))) return json(route, 400, { message: 'Enter the transaction ID from your payment confirmation message.', hint: '' });
    db.manualRows.push({ id: 'm1', txRef: 'cvm_x', email: db.user.email, plan: body.p_plan, months: body.p_months, amount: 2500 * body.p_months, currency: 'UGX', status: 'pending', method: body.p_network, provider: 'manual', providerRef: body.p_ref.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), payerPhone: body.p_phone, createdAt: new Date().toISOString() });
    return json(route, 200, { id: 'm1', amount: 2500 * body.p_months });
  }
  if (p === '/rest/v1/rpc/cvc_admin_auto_status') return json(route, 200, { enabled: db.auto, lastSmsAt: null, sms24h: 0, auto24h: 0 });
  if (p === '/rest/v1/rpc/cvc_admin_set_auto') { db.auto = body.p_enabled; return json(route, 200, null); }
  if (p === '/rest/v1/rpc/cvc_admin_payments') return json(route, 200, db.manualRows);
  if (p === '/rest/v1/rpc/cvc_admin_review_payment') { db.manualRows = []; return json(route, 200, null); }
  if (p === '/rest/v1/rpc/cvc_admin_codes') return json(route, 200, db.codes);
  if (p === '/rest/v1/rpc/cvc_admin_create_codes') { const made = Array.from({ length: body.p_count }, (_, i) => `CVC-TEST-000${i}-ABCD`); db.codes.push(...made.map((code) => ({ code, plan: body.p_plan, days: body.p_days, maxUses: body.p_max_uses, uses: 0, expiresAt: null, active: true, note: body.p_note }))); return json(route, 200, made); }
  return json(route, 404, { message: 'unmocked ' + p });
});

try {
  await page.goto(base + '/');
  await page.getByRole('link', { name: 'Get started' }).first().waitFor();
  assert.match(page.url(), /\/$/);
  await page.locator('h1.typewriter').waitFor();
  assert.equal(await page.locator('h1.typewriter').getAttribute('aria-label'), 'A job for everyone.');
  await page.locator('.desk .chip-lp').nth(4).click(); // switch the hero document to the Academic layout
  await page.locator('.desk .paper.t-academic').waitFor();
  await page.locator('.footer-mark').waitFor({ state: 'attached' });
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

  // Account: redeem codes, checkout, payment return
  await page.goto(base + '/#/app/account');
  await page.getByRole('heading', { name: 'Account & plan' }).waitFor();
  await page.getByLabel('Redeem code').fill('wrong-code');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.getByText('not valid').waitFor();
  await page.getByLabel('Redeem code').fill('cvc-good-aaaa-bbbb');
  await page.getByRole('button', { name: 'Redeem' }).click();
  await page.getByText('Active until').waitFor();
  db.plan = 'starter'; db.expires = null;
  await page.goto(base + '/?cvcpay=1&tx_ref=cvc_' + 'a'.repeat(32) + '&status=successful&transaction_id=1');
  await page.getByText('Active until').waitFor();
  assert.ok(!page.url().includes('cvcpay'), 'payment params are removed from the address bar');
  db.plan = 'starter';
  await page.goto(base + '/#/app/account');
  await page.reload();
  await page.getByRole('button', { name: 'Choose Professional' }).click();
  await page.getByText('Total today').waitFor();
  await page.getByText('3 months').click();
  await page.getByText('UGX 7,500').first().waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/04-pay.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL(/pay-mock\?m=3/);

  // Manual mobile money: only when online payments are off and a number is configured
  db.onlineOff = true; db.plan = 'starter'; db.expires = null;
  await page.goto(base + '/#/app/account'); await page.reload();
  await page.evaluate(async () => { Object.assign((await import('./js/config.js')).MANUAL_PAY, { mtn: '', airtel: '' }); });
  await page.getByRole('button', { name: 'Choose Professional' }).click();
  await page.getByText('Payments are not open yet').waitFor();
  await page.getByRole('button', { name: 'OK' }).click();
  await page.evaluate(async () => { (await import('./js/config.js')).MANUAL_PAY.mtn = '0770 000 000'; });
  await page.getByRole('button', { name: 'Choose Professional' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Send exactly').waitFor();
  await page.getByPlaceholder('Transaction ID').fill('x');
  await page.getByPlaceholder(/number you paid from/).fill('0772123456');
  await page.getByRole('button', { name: 'I have paid' }).click();
  await page.getByText('Enter the transaction ID').first().waitFor();
  await page.getByPlaceholder('Transaction ID').fill('MP261120.1234.A56789');
  await page.getByPlaceholder(/number you paid from/).fill('0772123456');
  await page.getByRole('button', { name: 'I have paid' }).click();
  await page.getByText('We will confirm your payment shortly').waitFor();
  db.onlineOff = false;

  // Admin: hidden and refused for normal users, working for admins
  await page.goto(base + '/#/app/admin');
  await page.getByText('No access').waitFor();
  assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
  db.admin = true;
  await page.goto(base + '/#/app/admin'); await page.reload();
  await page.getByText('Visitors per day').waitFor();
  await page.getByText('google.com').waitFor();
  await page.getByRole('tab', { name: 'Payments' }).click();
  await page.getByText('Automatic confirmation').waitFor();
  await page.getByRole('button', { name: 'Turn on' }).click();
  await page.getByText('Automatic confirmation is on.').waitFor();
  await page.getByText('waiting for you').waitFor();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Approve and grant plan' }).click();
  await page.getByText('Approved').waitFor();
  await page.getByRole('tab', { name: 'Redeem codes' }).click();
  await page.getByRole('button', { name: 'Generate codes' }).click();
  await page.locator('pre.codes').waitFor();
  assert.match(await page.locator('pre.codes').innerText(), /^CVC-TEST/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/05-admin.png` });
  db.admin = false;

  await page.goto(base + '/#/terms');
  await page.getByRole('heading', { name: 'Terms of Service' }).waitFor();
  await page.goto(base + '/#/privacy');
  await page.getByRole('heading', { name: 'Privacy Policy' }).waitFor();
  await page.goto(base + '/#/refunds');
  await page.getByRole('heading', { name: 'Payments and Refunds' }).waitFor();

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
