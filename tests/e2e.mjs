// End-to-end browser test. Starts the dev server on a temp DB and drives the UI with Playwright.
// Run:  node tests/e2e.mjs        (needs `playwright` with Chromium available)
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

const PORT = 3290;
const SHOTS = process.env.SHOTS_DIR || '';
process.env.CVC_DB_FILE = path.join(os.tmpdir(), `cvc-e2e-${process.pid}.json`);
process.env.SESSION_SECRET = 'e2e-secret-0123456789abcdef';
process.env.SITE_URL = `http://localhost:${PORT}`;
delete process.env.ANTHROPIC_API_KEY;

const { createServer } = await import('../dev-server.mjs');
const server = createServer().listen(PORT);
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const errors = [];
let step = 'start';
const log = (s) => { step = s; console.log('•', s); };

const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`[${step}] pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource.*(40[0-9]|50[0-9])/.test(m.text() + m.location().url)) errors.push(`[${step}] console: ${m.text()}`); });
const shot = async (name) => { if (SHOTS) { await fs.mkdir(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const url = (p) => `http://localhost:${PORT}${p}`;

try {
  log('landing page');
  await page.goto(url('/'));
  await page.getByRole('heading', { name: 'A job for everyone.' }).waitFor();
  assert.ok(await page.getByText('AI Resume Writer').isVisible());
  assert.ok(await page.getByText('$19').first().isVisible());
  await shot('01-landing');

  log('nav to pricing, templates, verify');
  await page.getByRole('link', { name: 'Templates', exact: true }).first().click();
  await page.getByText('Clean layouts that pass applicant tracking systems').waitFor();
  await shot('02-templates');
  await page.goto(url('/verify'));
  await page.getByRole('heading', { name: 'Verify a CV-Certify document' }).waitFor();
  await page.getByLabel('Document ID').fill('CVC-AAAA-BBBB-CCCC');
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.getByText('Document not found').waitFor();

  log('protected route redirects to login');
  await page.goto(url('/app/resumes'));
  await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('Incorrect email or password.').waitFor();

  log('sign up');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByLabel('Full name').fill('Amina Okafor');
  await page.getByLabel('Email').fill('amina@example.com');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('at least 8 characters').first().waitFor();
  await page.getByLabel('Password', { exact: true }).fill('a-good-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: 'Master profile' }).waitFor();
  await shot('03-profile');

  log('fill profile');
  await page.locator('input').nth(1).waitFor();
  const fill = async (label, val, nth = 0) => page.getByText(label, { exact: true }).locator('xpath=following-sibling::*[1]').nth(nth).fill(val);
  await fill('Professional headline', 'Operations Analyst');
  await fill('Phone', '+256 700 000 000');
  await fill('Location', 'Kampala, Uganda');
  await page.locator('textarea').first().fill('Operations analyst with four years of experience improving logistics workflows, reporting and supplier coordination for growing teams.');
  await page.getByRole('button', { name: 'Add experience' }).click();
  await fill('Job title', 'Operations Analyst');
  await fill('Company', 'Nile Logistics');
  await page.getByLabel('I currently work here').check();
  await page.getByPlaceholder(/One achievement per line/).fill('responsible for dispatch scheduling\nBuilt weekly KPI dashboards used by 6 regional managers in Excel and SQL');
  await page.locator('summary', { hasText: 'Skills' }).click();
  const skillInput = page.getByPlaceholder('Type a skill and press Enter');
  for (const s of ['Excel', 'SQL', 'Power BI', 'Process improvement', 'Stakeholder management']) { await skillInput.fill(s); await skillInput.press('Enter'); }
  await page.getByText('All changes saved').waitFor({ timeout: 8000 });

  log('profile persists after reload');
  await page.reload();
  await page.getByRole('heading', { name: 'Master profile' }).waitFor();
  const vals = await page.locator('input').evaluateAll((els) => els.map((e) => e.value));
  assert.ok(vals.includes('Operations Analyst') && vals.includes('Kampala, Uganda'), 'profile fields were not restored after reload: ' + vals.join('|'));
  await page.locator('summary', { hasText: 'Skills' }).click();
  assert.ok(await page.locator('.tag', { hasText: 'Stakeholder management' }).isVisible());

  log('AI basic mode polishes bullets (counts quota)');
  await page.getByRole('button', { name: 'Improve bullets' }).click();
  await page.getByText('Bullets rewritten').waitFor();
  assert.match(await page.getByPlaceholder(/One achievement per line/).inputValue(), /^Managed dispatch scheduling\./);

  log('create resume from profile');
  await page.getByRole('button', { name: 'Create resume from profile' }).click();
  await page.getByText('Live preview').waitFor();
  await page.locator('.paper h1', { hasText: 'Amina Okafor' }).waitFor();
  assert.ok(await page.locator('.paper').getByText('Nile Logistics').isVisible());
  await shot('04-editor');

  log('switch template and country, preview reacts');
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('button', { name: /Modern/ }).click();
  await page.locator('.paper.t-modern').waitFor({ timeout: 3000 });
  await page.getByLabel('Country format').selectOption('AF');
  await page.getByRole('tab', { name: 'Content' }).click();
  await page.getByText('Date of birth').first().waitFor();

  log('certify');
  await page.getByRole('tab', { name: 'Certify' }).click();
  await page.getByRole('button', { name: 'Certify this resume' }).click();
  await page.getByText('Certified.', { exact: false }).first().waitFor();
  const docId = (await page.locator('.doc-id').textContent()).trim();
  assert.match(docId, /^CVC-/);
  assert.ok(await page.locator('.paper .verified').isVisible());
  await shot('05-certified');

  log('editing after certify marks it stale');
  await page.getByRole('tab', { name: 'Content' }).click();
  await page.locator('textarea').first().fill('Operations analyst who improves logistics workflows and reporting.');
  await page.getByText('All changes saved').waitFor({ timeout: 8000 });
  await page.getByRole('tab', { name: 'Certify' }).click();
  await page.getByText('Edited since certified').first().waitFor();
  assert.equal(await page.locator('.paper .verified').count(), 0);
  await page.getByRole('button', { name: 'Re-certify now' }).click();
  await page.locator('.paper .verified').waitFor();

  log('download docx');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word (.docx)' }).click()]);
  const buf = await fs.readFile(await dl.path());
  assert.equal(buf.subarray(0, 2).toString(), 'PK');

  log('public verification as a logged-out recruiter');
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(url('/verify/' + docId));
  await anon.getByText('Valid CV-Certify document').waitFor();
  assert.ok(await anon.getByText('Amina Okafor').first().isVisible());
  assert.equal(await anon.getByText('amina@example.com').count(), 0, 'email must not be public');
  await anon.close();

  log('plan gating and upgrade');
  await page.goto(url('/app/ats'));
  await page.getByText('Available on Professional').waitFor();
  await page.goto(url('/app/account'));
  await page.getByRole('button', { name: 'Choose Professional' }).click();
  await page.getByRole('button', { name: 'Switch plan' }).click();
  await page.getByText('You are now on Professional.').waitFor();

  log('ATS scanner');
  await page.goto(url('/app/ats'));
  await page.getByPlaceholder('Paste the job description here…').fill('We need a Data Analyst skilled in SQL, Excel, Power BI and Python for data analysis and stakeholder management. Experience building dashboards is essential.');
  await page.getByRole('button', { name: 'Scan resume' }).click();
  await page.getByText('Missing keywords').waitFor();
  assert.ok(await page.locator('.ring').isVisible());
  await shot('06-ats');

  log('cover letter');
  await page.goto(url('/app/letters'));
  await page.getByRole('button', { name: 'Write a letter' }).click();
  await page.getByPlaceholder('Paste the job description…').fill('We are hiring an operations analyst to improve logistics workflows and reporting across regional teams.');
  await page.getByRole('button', { name: 'Generate letter' }).click();
  await page.waitForFunction(() => document.querySelector('textarea[placeholder^="Your letter"]')?.value.includes('Dear Hiring Manager'));

  log('dashboard, mobile layout');
  await page.goto(url('/app'));
  await page.getByRole('heading', { name: /Welcome, Amina/ }).waitFor();
  await shot('07-dashboard');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(url('/'));
  await page.getByRole('heading', { name: 'A job for everyone.' }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `horizontal overflow on mobile landing: ${overflow}px`);
  await shot('08-mobile');
  await page.goto(url('/app/resumes'));
  await page.getByRole('heading', { name: 'Resumes' }).waitFor();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow2 <= 1, `horizontal overflow on mobile app: ${overflow2}px`);

  log('sign out');
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto(url('/app'));
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('heading', { name: 'A job for everyone.' }).waitFor();

  assert.deepEqual(errors, [], 'browser errors:\n' + errors.join('\n'));
  console.log('\nE2E PASSED');
} catch (e) {
  console.error(`\nE2E FAILED at step "${step}":`, e.message);
  if (errors.length) console.error('Browser errors:\n' + errors.join('\n'));
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
