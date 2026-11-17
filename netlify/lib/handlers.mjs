import crypto from 'node:crypto';
import { HttpError, json, newId, newDocId, normalizeDocId, isEmail, nowIso, stableStringify, sha256, siteUrl } from './util.mjs';
import { db } from './db.mjs';
import { hashPassword, verifyPassword, checkPasswordStrength, sessionCookie, clearCookie, getSessionUser, throttle, clearThrottle, signToken, verifyToken } from './auth.mjs';
import { cleanContent, cleanJob, cleanTemplate, cleanCountry, cleanTitle, cleanSlug, text as cleanText } from './schema.mjs';
import { planOf, publicPlan, requireFeature, spendRewrite, refundRewrite } from './plans.mjs';
import { PLANS, emptyContent } from '../../public/js/shared/constants.js';
import { scoreResume } from './ats.mjs';
import * as ai from './ai.mjs';

const body = async (req) => {
  try {
    const t = await req.text();
    if (t.length > 400_000) throw new HttpError(413, 'Request too large.');
    return t ? JSON.parse(t) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'Invalid JSON body.');
  }
};

const need = async (req) => {
  const user = await getSessionUser(req);
  if (!user) throw new HttpError(401, 'Please sign in to continue.', 'unauthenticated');
  return user;
};

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  country: u.country || 'US',
  plan: publicPlan(u),
  createdAt: u.createdAt,
  hasPassword: !!u.passwordHash,
});

const emailKey = (e) => e.trim().toLowerCase();

async function createUser({ name, email, passwordHash, googleId }) {
  const key = emailKey(email);
  const user = {
    id: newId('u_'),
    name: String(name || '').trim().slice(0, 120) || key.split('@')[0],
    email: key,
    passwordHash: passwordHash || null,
    googleId: googleId || null,
    plan: 'starter',
    country: 'US',
    sessionVersion: 0,
    usage: {},
    createdAt: nowIso(),
  };
  await db.put('emails', key, { userId: user.id });
  await db.put('users', user.id, user);
  const content = emptyContent();
  content.personal.fullName = user.name;
  content.personal.email = user.email;
  await db.put('profiles', user.id, { content, updatedAt: nowIso() }, user.id);
  return user;
}

const withCookie = (req, user, data, status = 200) => json(status, data, { 'set-cookie': sessionCookie(req, user) });

/* ================= auth ================= */

async function signup(req) {
  const { name, email, password } = await body(req);
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.', 'bad_email');
  checkPasswordStrength(password);
  if (!String(name || '').trim()) throw new HttpError(400, 'Enter your full name.', 'bad_name');
  throttle('signup:' + (req.headers.get('x-nf-client-connection-ip') || 'local'), 20);
  if (await db.get('emails', emailKey(email))) throw new HttpError(409, 'An account with this email already exists. Try signing in.', 'email_taken');
  const user = await createUser({ name, email, passwordHash: await hashPassword(password) });
  return withCookie(req, user, { user: publicUser(user) }, 201);
}

async function login(req) {
  const { email, password } = await body(req);
  if (!isEmail(email) || typeof password !== 'string') throw new HttpError(400, 'Enter your email and password.');
  const key = 'login:' + emailKey(email);
  throttle(key);
  const rec = await db.get('emails', emailKey(email));
  const user = rec ? await db.get('users', rec.userId) : null;
  // Always run a hash comparison so response time does not reveal whether the account exists.
  const ok = await verifyPassword(password, user?.passwordHash || 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86));
  if (!user || !ok) {
    if (user && !user.passwordHash) throw new HttpError(401, 'This account uses Google sign-in. Use "Continue with Google".', 'use_google');
    throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials');
  }
  clearThrottle(key);
  return withCookie(req, user, { user: publicUser(user) });
}

async function logout(req) {
  return json(200, { ok: true }, { 'set-cookie': clearCookie(req) });
}

async function google(req) {
  const { credential } = await body(req);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(501, 'Google sign-in is not configured on this server.', 'not_configured');
  if (typeof credential !== 'string') throw new HttpError(400, 'Missing Google credential.');
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!res.ok) throw new HttpError(401, 'Google sign-in failed. Please try again.', 'google_failed');
  const info = await res.json();
  if (info.aud !== clientId || !(info.email_verified === true || info.email_verified === 'true')) throw new HttpError(401, 'Google sign-in could not be verified.', 'google_failed');
  const rec = await db.get('emails', emailKey(info.email));
  let user = rec ? await db.get('users', rec.userId) : null;
  if (!user) user = await createUser({ name: info.name, email: info.email, googleId: info.sub });
  else if (!user.googleId) {
    user.googleId = info.sub;
    await db.put('users', user.id, user);
  }
  return withCookie(req, user, { user: publicUser(user) });
}

async function forgot(req) {
  const { email } = await body(req);
  if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  throttle('forgot:' + emailKey(email), 3);
  if (!process.env.RESEND_API_KEY) throw new HttpError(501, 'Password reset email is not configured on this server. Contact support to reset your password.', 'not_configured');
  const rec = await db.get('emails', emailKey(email));
  const user = rec ? await db.get('users', rec.userId) : null;
  if (user) {
    const token = signToken({ sub: user.id, purpose: 'reset', v: user.sessionVersion || 0 }, 3600);
    const link = `${siteUrl(req)}/reset?token=${encodeURIComponent(token)}`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'CV-Certify <onboarding@resend.dev>',
        to: user.email,
        subject: 'Reset your CV-Certify password',
        html: `<p>Hi ${user.name.replace(/[<>&]/g, '')},</p><p><a href="${link}">Reset your password</a>. This link expires in 1 hour. If you did not ask for this, you can ignore this email.</p>`,
      }),
    });
    if (!r.ok) throw new HttpError(502, 'Could not send the email. Please try again later.');
  }
  // Same response whether or not the account exists.
  return json(200, { ok: true });
}

async function reset(req) {
  const { token, password } = await body(req);
  checkPasswordStrength(password);
  const p = verifyToken(token);
  if (!p || p.purpose !== 'reset') throw new HttpError(400, 'This reset link is invalid or has expired.', 'bad_token');
  const user = await db.get('users', p.sub);
  if (!user || (user.sessionVersion || 0) !== (p.v || 0)) throw new HttpError(400, 'This reset link has already been used.', 'bad_token');
  user.passwordHash = await hashPassword(password);
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  await db.put('users', user.id, user);
  return withCookie(req, user, { user: publicUser(user) });
}

/* ================= account ================= */

async function me(req) {
  const user = await getSessionUser(req);
  return json(200, { user: user ? publicUser(user) : null });
}

async function updateMe(req) {
  const user = await need(req);
  const b = await body(req);
  if (typeof b.name === 'string' && b.name.trim()) user.name = b.name.trim().slice(0, 120);
  if (b.country) user.country = cleanCountry(b.country);
  if (b.newPassword) {
    checkPasswordStrength(b.newPassword);
    if (user.passwordHash && !(await verifyPassword(String(b.currentPassword || ''), user.passwordHash))) throw new HttpError(400, 'Current password is incorrect.');
    user.passwordHash = await hashPassword(b.newPassword);
    user.sessionVersion = (user.sessionVersion || 0) + 1;
  }
  await db.put('users', user.id, user);
  return withCookie(req, user, { user: publicUser(user) });
}

async function deleteMe(req) {
  const user = await need(req);
  const { confirm } = await body(req);
  if (confirm !== user.email) throw new HttpError(400, 'Type your email address to confirm deletion.');
  for (const col of ['resumes', 'letters']) for (const r of await db.list(col, user.id)) await db.del(col, r.id);
  for (const d of await db.list('docs', user.id)) await db.put('docs', d.id, { ...d, revoked: true, revokedReason: 'Account deleted', snapshot: null }, user.id);
  await db.del('profiles', user.id);
  await db.del('emails', user.email);
  await db.del('users', user.id);
  return json(200, { ok: true }, { 'set-cookie': clearCookie(req) });
}

async function setPlan(req) {
  const user = await need(req);
  const { plan } = await body(req);
  if (!PLANS[plan]) throw new HttpError(400, 'Unknown plan.');
  if (process.env.ALLOW_SELF_SERVE_PLAN_CHANGE === 'false') throw new HttpError(403, 'Plan changes are handled through billing. Payments are not enabled yet.', 'billing_required');
  user.plan = plan;
  await db.put('users', user.id, user);
  return json(200, { user: publicUser(user) });
}

/* ================= profile ================= */

async function getProfile(req) {
  const user = await need(req);
  const p = (await db.get('profiles', user.id)) || { content: emptyContent() };
  return json(200, { content: p.content, updatedAt: p.updatedAt || null });
}

async function putProfile(req) {
  const user = await need(req);
  const { content } = await body(req);
  const clean = cleanContent(content);
  await db.put('profiles', user.id, { content: clean, updatedAt: nowIso() }, user.id);
  return json(200, { content: clean });
}

/* ================= resumes ================= */

const resumeView = (r) => ({ id: r.id, title: r.title, template: r.template, country: r.country, content: r.content, job: r.job, docId: r.docId || null, certifiedAt: r.certifiedAt || null, certifiedHash: r.certifiedHash || null, updatedAt: r.updatedAt, createdAt: r.createdAt });
const hashOf = (r) => sha256(stableStringify({ c: r.content, t: r.template, k: r.country }));

async function ownResume(user, id) {
  const r = await db.get('resumes', id);
  if (!r || r.userId !== user.id) throw new HttpError(404, 'Resume not found.', 'not_found');
  return r;
}

async function listResumes(req) {
  const user = await need(req);
  const list = await db.list('resumes', user.id);
  return json(200, { resumes: list.map((r) => ({ id: r.id, title: r.title, template: r.template, country: r.country, jobTitle: r.job?.title || '', docId: r.docId || null, certifiedAt: r.certifiedAt || null, changedSinceCertified: !!r.docId && hashOf(r) !== r.certifiedHash, updatedAt: r.updatedAt, name: r.content?.personal?.fullName || '' })) });
}

async function createResume(req) {
  const user = await need(req);
  const b = await body(req);
  const limit = planOf(user).limits.resumes;
  if ((await db.list('resumes', user.id)).length >= limit) throw new HttpError(402, `Your ${planOf(user).name} plan includes ${limit} resumes. Upgrade for unlimited resumes and versions.`, 'quota_exceeded');
  let content;
  if (b.fromResumeId) content = (await ownResume(user, b.fromResumeId)).content;
  else content = (await db.get('profiles', user.id))?.content || emptyContent();
  const now = nowIso();
  const r = {
    id: newId('r_'),
    userId: user.id,
    title: cleanTitle(b.title, 'My resume'),
    template: cleanTemplate(b.template),
    country: cleanCountry(b.country || user.country),
    content: cleanContent(content),
    job: cleanJob(b.job),
    docId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('resumes', r.id, r, user.id);
  return json(201, { resume: resumeView(r) });
}

async function getResume(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  return json(200, { resume: resumeView(r), changedSinceCertified: !!r.docId && hashOf(r) !== r.certifiedHash });
}

async function putResume(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  const b = await body(req);
  if (b.title !== undefined) r.title = cleanTitle(b.title, r.title);
  if (b.template !== undefined) r.template = cleanTemplate(b.template);
  if (b.country !== undefined) r.country = cleanCountry(b.country);
  if (b.content !== undefined) r.content = cleanContent(b.content);
  if (b.job !== undefined) r.job = cleanJob(b.job);
  r.updatedAt = nowIso();
  await db.put('resumes', r.id, r, user.id);
  return json(200, { resume: resumeView(r), changedSinceCertified: !!r.docId && hashOf(r) !== r.certifiedHash });
}

async function deleteResume(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  if (r.docId) {
    const d = await db.get('docs', r.docId);
    if (d) await db.put('docs', r.docId, { ...d, revoked: true, revokedReason: 'Deleted by owner', snapshot: null }, user.id);
  }
  await db.del('resumes', id);
  return json(200, { ok: true });
}

/* ---- verification: issue / reissue / public lookup ---- */

async function certify(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  if (!r.content?.personal?.fullName) throw new HttpError(400, 'Add your full name before certifying this document.');
  const hash = hashOf(r);
  if (r.docId && r.certifiedHash === hash) return json(200, { resume: resumeView(r), unchanged: true });
  const prev = r.docId ? await db.get('docs', r.docId) : null;
  const docId = r.docId || newDocId();
  const history = [...(prev?.history || []), { at: nowIso(), hash }].slice(-20);
  const issuedAt = prev?.issuedAt || nowIso();
  const p = r.content.personal;
  await db.put('docs', docId, {
    id: docId,
    kind: 'resume',
    ownerId: user.id,
    holder: p.fullName,
    headline: p.headline || '',
    title: r.title,
    template: r.template,
    country: r.country,
    hash,
    issuedAt,
    updatedAt: nowIso(),
    revoked: false,
    history,
    // The verifier sees what the candidate certified, minus private contact details.
    snapshot: {
      fullName: p.fullName,
      headline: p.headline,
      location: p.location,
      summary: r.content.summary,
      experience: r.content.experience.map(({ role, company, start, end, current }) => ({ role, company, start, end, current })),
      education: r.content.education.map(({ school, degree, field, end }) => ({ school, degree, field, end })),
      certifications: r.content.certifications.map(({ name, issuer, year }) => ({ name, issuer, year })),
      skills: r.content.skills,
    },
  }, user.id);
  r.docId = docId;
  r.certifiedAt = nowIso();
  r.certifiedHash = hash;
  await db.put('resumes', r.id, r, user.id);
  return json(200, { resume: resumeView(r), unchanged: false });
}

async function revoke(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  if (!r.docId) throw new HttpError(400, 'This resume has not been certified.');
  const d = await db.get('docs', r.docId);
  if (d) await db.put('docs', r.docId, { ...d, revoked: true, revokedReason: 'Revoked by owner', updatedAt: nowIso() }, user.id);
  // Detach so the next certification issues a brand-new ID (a revoked ID is never reused).
  r.docId = null;
  r.certifiedAt = null;
  r.certifiedHash = null;
  await db.put('resumes', r.id, r, user.id);
  return json(200, { resume: resumeView(r) });
}

async function verifyPublic(req, rawId) {
  throttle('verify:' + (req.headers.get('x-nf-client-connection-ip') || 'local'), 120, 60_000);
  const id = normalizeDocId(rawId);
  const d = id ? await db.get('docs', id) : null;
  if (!d) throw new HttpError(404, 'No document with this ID was found. Check the ID for typos.', 'not_found');
  return json(200, {
    id: d.id,
    status: d.revoked ? 'revoked' : 'valid',
    revokedReason: d.revoked ? d.revokedReason : undefined,
    holder: d.holder,
    headline: d.headline,
    kind: d.kind,
    issuedAt: d.issuedAt,
    updatedAt: d.updatedAt,
    revisions: (d.history || []).length,
    snapshot: d.revoked ? null : d.snapshot,
    note: 'CV-Certify confirms this document was issued from this account and has not been altered since. It does not independently verify employers or qualifications.',
  });
}

// Check that an uploaded/pasted copy matches a certified document.
async function verifyHash(req) {
  const { docId, content, template, country } = await body(req);
  const d = await db.get('docs', normalizeDocId(docId));
  if (!d) throw new HttpError(404, 'No document with this ID was found.', 'not_found');
  const hash = sha256(stableStringify({ c: cleanContent(content), t: cleanTemplate(template), k: cleanCountry(country) }));
  return json(200, { match: !d.revoked && hash === d.hash });
}

/* ---- exports ---- */

async function exportResume(req, id) {
  const user = await need(req);
  const r = await ownResume(user, id);
  const { resumeToDocx } = await import('./docx-export.mjs');
  const verifyUrl = r.docId ? `${siteUrl(req)}/verify/${r.docId}` : '';
  const buf = await resumeToDocx({ content: r.content, template: r.template, country: r.country, docId: r.docId && hashOf(r) === r.certifiedHash ? r.docId : null, verifyUrl });
  const fname = (r.content.personal.fullName || 'resume').replace(/[^\w]+/g, '_');
  return new Response(buf, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `attachment; filename="${fname}_${r.title.replace(/[^\w]+/g, '_')}.docx"`, 'cache-control': 'no-store' } });
}

/* ================= letters ================= */

const letterView = (l) => ({ id: l.id, title: l.title, text: l.text, job: l.job, resumeId: l.resumeId || null, updatedAt: l.updatedAt, createdAt: l.createdAt });

async function ownLetter(user, id) {
  const l = await db.get('letters', id);
  if (!l || l.userId !== user.id) throw new HttpError(404, 'Letter not found.', 'not_found');
  return l;
}

async function listLetters(req) {
  const user = await need(req);
  return json(200, { letters: (await db.list('letters', user.id)).map(letterView) });
}

async function saveLetter(req, id) {
  const user = await need(req);
  const b = await body(req);
  let l;
  if (id) l = await ownLetter(user, id);
  else {
    requireFeature(user, 'letters');
    l = { id: newId('l_'), userId: user.id, createdAt: nowIso() };
  }
  if (b.title !== undefined || !id) l.title = cleanTitle(b.title, 'Cover letter');
  if (b.text !== undefined || !id) l.text = cleanText(b.text ?? '', 8000);
  if (b.job !== undefined || !id) l.job = cleanJob(b.job);
  if (b.resumeId !== undefined) l.resumeId = typeof b.resumeId === 'string' ? b.resumeId : null;
  l.updatedAt = nowIso();
  await db.put('letters', l.id, l, user.id);
  return json(id ? 200 : 201, { letter: letterView(l) });
}

async function deleteLetter(req, id) {
  const user = await need(req);
  await ownLetter(user, id);
  await db.del('letters', id);
  return json(200, { ok: true });
}

async function exportLetter(req, id) {
  const user = await need(req);
  const l = await ownLetter(user, id);
  const { letterToDocx } = await import('./docx-export.mjs');
  const buf = await letterToDocx({ text: l.text, name: l.title });
  return new Response(buf, { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'content-disposition': `attachment; filename="${l.title.replace(/[^\w]+/g, '_')}.docx"` } });
}

/* ================= AI ================= */

const guard = async (req, { feature, spend } = {}) => {
  const user = await need(req);
  throttle('ai:' + user.id, 40, 10 * 60 * 1000);
  if (feature) requireFeature(user, feature);
  if (spend) await spendRewrite(user);
  return user;
};
const aiRun = async (user, spent, fn) => {
  try {
    return await fn();
  } catch (e) {
    if (spent) await refundRewrite(user);
    throw e;
  }
};
const needJob = (j) => {
  const job = cleanJob(j);
  if (job.description.trim().length < 40) throw new HttpError(400, 'Paste the job description first (at least a few sentences).', 'need_job');
  return job;
};

async function aiBullets(req) {
  const user = await guard(req, { spend: true });
  return json(200, await aiRun(user, true, async () => {
    const b = await body(req);
    const bullets = (Array.isArray(b.bullets) ? b.bullets : []).slice(0, 12).map((x) => cleanText(x, 500)).filter((x) => x.trim());
    if (!bullets.length) throw new HttpError(400, 'Add at least one bullet point first.');
    return ai.rewriteBullets({ bullets, role: cleanText(b.role, 160), company: cleanText(b.company, 160), job: b.job ? cleanJob(b.job) : null });
  }).then((r) => ({ ...r, plan: publicPlan(user) })));
}

async function aiSummary(req) {
  const user = await guard(req, { spend: true });
  const b = await body(req);
  const r = await aiRun(user, true, () => ai.writeSummary({ content: cleanContent(b.content), job: b.job ? cleanJob(b.job) : null }));
  return json(200, { ...r, plan: publicPlan(user) });
}

async function aiTailor(req) {
  const user = await guard(req, { spend: true });
  const b = await body(req);
  const r = await aiRun(user, true, async () => {
    const job = needJob(b.job);
    const out = await ai.tailorResume({ content: cleanContent(b.content), job, country: cleanCountry(b.country) });
    return { ...out, content: cleanContent(out.content) };
  });
  return json(200, { ...r, plan: publicPlan(user) });
}

async function aiLetter(req) {
  const user = await guard(req, { feature: 'letters', spend: true });
  const b = await body(req);
  const r = await aiRun(user, true, () => ai.writeCoverLetter({ content: cleanContent(b.content), job: needJob(b.job), tone: ['professional', 'warm', 'confident', 'concise'].includes(b.tone) ? b.tone : 'professional', country: cleanCountry(b.country) }));
  return json(200, r);
}

async function atsScan(req) {
  const user = await guard(req, { feature: 'ats' });
  const b = await body(req);
  return json(200, scoreResume(cleanContent(b.content), needJob(b.job).description));
}

async function aiInterview(req) {
  const user = await guard(req, { feature: 'interview' });
  const b = await body(req);
  return json(200, await ai.interviewPrep({ content: cleanContent(b.content), job: needJob(b.job) }));
}

async function aiRoadmap(req) {
  const user = await guard(req, { feature: 'roadmap' });
  const b = await body(req);
  const content = cleanContent(b.content);
  const job = needJob(b.job);
  const { missing } = scoreResume(content, job.description);
  return json(200, { missing, ...(await ai.skillRoadmap({ content, job, missing })) });
}

async function aiAssistant(req) {
  const user = await guard(req);
  const b = await body(req);
  const message = cleanText(b.message, 2000).trim();
  if (!message) throw new HttpError(400, 'Type a question first.');
  const profile = (await db.get('profiles', user.id))?.content || emptyContent();
  return json(200, await ai.assistant({ message, history: Array.isArray(b.history) ? b.history.slice(-8) : [], content: profile, context: b.context }));
}

/* ================= portfolio (Career+) ================= */

async function getPortfolio(req) {
  const user = await need(req);
  return json(200, { portfolio: (await db.get('portfolios', 'u:' + user.id)) || { enabled: false, slug: '', headline: '', about: '', links: [] } });
}

async function putPortfolio(req) {
  const user = await need(req);
  requireFeature(user, 'portfolio');
  const b = await body(req);
  const slug = cleanSlug(b.slug);
  if (b.enabled && slug.length < 3) throw new HttpError(400, 'Choose a web address of at least 3 letters, numbers or hyphens.');
  const taken = slug ? await db.get('portfolios', 's:' + slug) : null;
  if (taken && taken.userId !== user.id) throw new HttpError(409, 'That web address is already taken.', 'slug_taken');
  const prev = await db.get('portfolios', 'u:' + user.id);
  if (prev?.slug && prev.slug !== slug) await db.del('portfolios', 's:' + prev.slug);
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 8).map((l) => ({ label: cleanText(l?.label, 60), url: /^https?:\/\//i.test(l?.url || '') ? cleanText(l.url, 300) : '' })).filter((l) => l.label && l.url);
  const p = { enabled: !!b.enabled, slug, headline: cleanText(b.headline, 160), about: cleanText(b.about, 1500), links, resumeId: typeof b.resumeId === 'string' ? b.resumeId : null, userId: user.id };
  await db.put('portfolios', 'u:' + user.id, p, user.id);
  if (slug) await db.put('portfolios', 's:' + slug, p, null);
  return json(200, { portfolio: p });
}

async function publicPortfolio(req, slug) {
  const p = await db.get('portfolios', 's:' + cleanSlug(slug));
  if (!p || !p.enabled) throw new HttpError(404, 'This portfolio does not exist.', 'not_found');
  const owner = await db.get('users', p.userId);
  if (!owner || owner.plan !== 'career') throw new HttpError(404, 'This portfolio does not exist.', 'not_found');
  const r = p.resumeId ? await db.get('resumes', p.resumeId) : null;
  const c = r && r.userId === p.userId ? r.content : (await db.get('profiles', p.userId))?.content;
  const pe = c?.personal || {};
  return json(200, {
    name: pe.fullName || owner.name,
    headline: p.headline || pe.headline || '',
    about: p.about || c?.summary || '',
    location: pe.location || '',
    links: p.links,
    skills: c?.skills || [],
    experience: (c?.experience || []).map(({ role, company, start, end, current, bullets }) => ({ role, company, start, end, current, bullets })),
    projects: c?.projects || [],
    docId: r?.docId || null,
  });
}

export const config = () => ({
  ai: ai.aiEnabled(),
  google: process.env.GOOGLE_CLIENT_ID || null,
  passwordReset: !!process.env.RESEND_API_KEY,
  selfServePlans: process.env.ALLOW_SELF_SERVE_PLAN_CHANGE !== 'false',
  storage: db.mode,
});

/* ================= router ================= */

const R = [];
const add = (method, pattern, fn) => R.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '/?$'), fn });

add('GET', '/api/config', async () => json(200, config()));
add('POST', '/api/auth/signup', signup);
add('POST', '/api/auth/login', login);
add('POST', '/api/auth/logout', logout);
add('POST', '/api/auth/google', google);
add('POST', '/api/auth/forgot', forgot);
add('POST', '/api/auth/reset', reset);
add('GET', '/api/me', me);
add('PATCH', '/api/me', updateMe);
add('DELETE', '/api/me', deleteMe);
add('POST', '/api/me/plan', setPlan);
add('GET', '/api/profile', getProfile);
add('PUT', '/api/profile', putProfile);
add('GET', '/api/resumes', listResumes);
add('POST', '/api/resumes', createResume);
add('GET', '/api/resumes/:id', getResume);
add('PUT', '/api/resumes/:id', putResume);
add('DELETE', '/api/resumes/:id', deleteResume);
add('POST', '/api/resumes/:id/certify', certify);
add('POST', '/api/resumes/:id/revoke', revoke);
add('GET', '/api/resumes/:id/export', exportResume);
add('GET', '/api/letters', listLetters);
add('POST', '/api/letters', (req) => saveLetter(req, null));
add('PUT', '/api/letters/:id', saveLetter);
add('DELETE', '/api/letters/:id', deleteLetter);
add('GET', '/api/letters/:id/export', exportLetter);
add('POST', '/api/ai/bullets', aiBullets);
add('POST', '/api/ai/summary', aiSummary);
add('POST', '/api/ai/tailor', aiTailor);
add('POST', '/api/ai/letter', aiLetter);
add('POST', '/api/ai/ats', atsScan);
add('POST', '/api/ai/interview', aiInterview);
add('POST', '/api/ai/roadmap', aiRoadmap);
add('POST', '/api/ai/assistant', aiAssistant);
add('GET', '/api/portfolio', getPortfolio);
add('PUT', '/api/portfolio', putPortfolio);
add('GET', '/api/p/:slug', publicPortfolio);
add('GET', '/api/verify/:id', verifyPublic);
add('POST', '/api/verify', verifyHash);

export async function handle(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    for (const r of R) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(path);
      if (m) {
        // CSRF: reject cross-site state-changing requests (cookie is SameSite=Lax; this is defence in depth).
        if (req.method !== 'GET' && req.headers.get('origin')) {
          const o = new URL(req.headers.get('origin'));
          if (o.host !== url.host && o.host !== req.headers.get('host')) throw new HttpError(403, 'Cross-site request blocked.', 'csrf');
        }
        return await r.fn(req, ...m.slice(1).map(decodeURIComponent));
      }
    }
    throw new HttpError(404, 'Not found.', 'not_found');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code });
    console.error('Unhandled API error:', e);
    return json(500, { error: 'Something went wrong on our side. Please try again.', code: 'server_error' });
  }
}
