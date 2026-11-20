// Maps the app's REST-style calls onto Supabase. Security lives in the database (RLS, column grants,
// triggers, RPCs) and the Edge Function; this layer only shapes requests and responses.
import { auth, rest, rpc, fn, SbError } from './supabase-lite.js';
import { ApiError } from './errors.js';
import { cleanContent, cleanJob, cleanTemplate, cleanCountry, cleanTitle, cleanSlug, text } from './shared/clean.mjs';
import { emptyContent, LETTER_FORMATS } from './shared/constants.js';
import { detectCountry } from './shared/currency.js';

const appUrl = (p) => location.origin + location.pathname + '#' + p;

/* ---------- errors ---------- */
const AUTH_MSG = {
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link.',
  user_already_exists: 'An account with that email already exists. Try signing in.',
  weak_password: 'That password is too weak. Use at least 8 characters and avoid common passwords.',
  signup_disabled: 'New sign-ups are currently disabled.',
  over_email_send_rate_limit: 'Too many emails requested. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  same_password: 'Choose a password different from your current one.',
  validation_failed: 'Please enter a valid email address.',
};
function fail(e) {
  if (e instanceof ApiError) return e;
  if (!(e instanceof SbError)) return new ApiError('Something went wrong. Please try again.', 500, 'client_error');
  if (e.status === 0) return new ApiError(e.message, 0, 'network');
  const hint = e.hint;
  if (hint === 'quota_exceeded' || hint === 'upgrade_required') return new ApiError(e.message, 402, hint);
  if (hint === 'forbidden') return new ApiError('You do not have access to this page.', 403, 'forbidden');
  if (hint === 'duplicate_ref' || hint === 'too_many_pending' || hint === 'bad_code' || hint === 'already_redeemed' || hint === 'higher_plan' || hint === 'rate_limited') return new ApiError(e.message, 400, hint);
  if (hint === 'billing_required') return new ApiError(e.message, 402, hint);
  if (hint === 'not_found') return new ApiError(e.message, 404, 'not_found');
  if (hint === 'unauthenticated' || e.code === 'unauthenticated') return new ApiError('Please sign in to continue.', 401, 'unauthenticated');
  if (e.code === '23505') return new ApiError('That web address is already taken.', 409, 'slug_taken');
  if (e.code === '23514') return new ApiError('Some of the data is too long or not allowed. Please shorten it and try again.', 400, 'invalid');
  if (AUTH_MSG[e.code]) return new ApiError(AUTH_MSG[e.code], e.status || 400, e.code);
  if (e.status === 401) return new ApiError('Please sign in to continue.', 401, 'unauthenticated');
  if (e.status === 429) return new ApiError('Too many requests. Please wait a few minutes and try again.', 429, 'rate_limited');
  if (e.status >= 500) return new ApiError('Something went wrong on our side. Please try again.', e.status, 'server_error');
  return new ApiError(e.message, e.status || 400, e.code || 'error');
}

/* ---------- shapes ---------- */
const unlimited = (v) => (typeof v === 'number' && v < 1e9 ? v : null);
function userView(u) {
  if (!u) return null;
  const l = u.plan.limits;
  return { ...u, hasPassword: true, plan: { ...u.plan, limits: { resumes: unlimited(l.resumes), rewrites: unlimited(l.rewrites), letters: !!l.letters, ats: !!l.ats, interview: !!l.interview, roadmap: !!l.roadmap, portfolio: !!l.portfolio } } };
}
const stale = (r) => !!r.doc_id && r.current_hash !== r.certified_hash;
const resumeView = (r) => ({ id: r.id, title: r.title, template: r.template, country: r.country, content: r.content, job: r.job || {}, docId: r.doc_id || null, certifiedAt: r.certified_at || null, certifiedHash: r.certified_hash || null, updatedAt: r.updated_at, createdAt: r.created_at });
const letterView = (l) => ({ id: l.id, title: l.title, text: l.text, job: l.job || {}, resumeId: l.resume_id || null, format: l.format || 'formal', updatedAt: l.updated_at, createdAt: l.created_at });
const portfolioView = (p) => ({ enabled: !!p?.enabled, slug: p?.slug || '', headline: p?.headline || '', about: p?.about || '', links: p?.links || [], resumeId: p?.resume_id || null });
const one = (rows, what) => {
  const r = Array.isArray(rows) ? rows[0] : rows;
  if (!r) throw new ApiError(`${what} not found.`, 404, 'not_found');
  return r;
};
const REP = 'return=representation';
const eq = (id) => `id=eq.${encodeURIComponent(id)}`;
const meUser = async () => {
  let u = await rpc('cvc_ensure_account');
  // A brand-new account starts with the default format. Switch it to the one that fits where the person is.
  const fresh = Date.now() - new Date(u.createdAt).getTime() < 5 * 60 * 1000;
  const guess = detectCountry();
  if (fresh && u.country === 'US' && guess !== 'US') {
    try { await rest('PATCH', 'cvc_accounts', { query: `user_id=eq.${uid()}`, body: { country: guess } }); u = await rpc('cvc_me'); } catch { /* keep the default */ }
  }
  return userView(u);
};
const uid = () => {
  const id = auth.userId();
  if (!id) throw new ApiError('Please sign in to continue.', 401, 'unauthenticated');
  return id;
};
const patchPick = (b, map) => Object.fromEntries(Object.entries(map).filter(([k]) => b[k] !== undefined).map(([k, f]) => f(b[k])));

/* ---------- router ---------- */
const routes = [];
const on = (method, re, fnc) => routes.push([method, re, fnc]);

// config + me
on('GET', /^\/config$/, async () => {
  const [cfg, settings] = await Promise.all([rpc('cvc_config', {}, { anon: true }).catch(() => ({})), auth.settings().catch(() => null)]);
  return { selfServePlans: cfg?.selfServePlans === true, google: !!settings?.external?.google, signupsOpen: settings ? !settings.disable_signup : true };
});
on('GET', /^\/me$/, async () => (auth.hasSession() ? { user: await meUser() } : { user: null }));
on('PATCH', /^\/me$/, async (_, b) => {
  if (b.newPassword !== undefined) {
    if (String(b.newPassword).length < 8) throw new ApiError('Password must be at least 8 characters.', 400, 'weak_password');
    await auth.updateUser({ password: String(b.newPassword) });
    return { ok: true };
  }
  const upd = patchPick(b, { name: (v) => ['name', cleanTitle(v, 'User').slice(0, 120)], country: (v) => ['country', cleanCountry(v)] });
  if (Object.keys(upd).length) await rest('PATCH', 'cvc_accounts', { query: `user_id=eq.${uid()}`, body: upd });
  return { user: userView(await rpc('cvc_me')) };
});
on('DELETE', /^\/me$/, async (_, b) => {
  const email = (await rpc('cvc_me'))?.email || auth.user()?.email || '';
  if (String(b.confirm || '').trim().toLowerCase() !== email.toLowerCase()) throw new ApiError('Type your email address exactly to confirm.', 400, 'confirm_mismatch');
  await rpc('cvc_delete_my_data');
  await auth.signOut();
  return { ok: true };
});
on('POST', /^\/me\/plan$/, async (_, b) => ({ user: userView(await rpc('cvc_set_plan', { p_plan: String(b.plan) })) }));

// billing: card and mobile-money checkout (server computes the price), redeem codes, history
const payFn = async (body) => {
  try { return await fn('cvc-pay', body); } catch (e) {
    if (e instanceof SbError && e.code === 'payments_off') throw new ApiError(e.message, 400, 'payments_off');
    if (e instanceof SbError && e.status === 404) throw new ApiError('Online payments are not available right now.', 503, 'unavailable');
    throw e;
  }
};
on('GET', /^\/billing\/config$/, async () => { try { return await fn('cvc-pay', { task: 'config' }); } catch { return { enabled: false }; } });
on('POST', /^\/billing\/checkout$/, async (_, b) => payFn({ task: 'checkout', plan: String(b.plan), months: Number(b.months) || 1, returnUrl: location.origin + location.pathname }));
on('POST', /^\/billing\/verify$/, async (_, b) => ({ result: await payFn({ task: 'verify', txRef: String(b.txRef || '') }), user: userView(await rpc('cvc_me')) }));
on('GET', /^\/billing\/history$/, async () => ({ payments: await rest('GET', 'cvc_payments', { query: 'select=id,plan,months,amount,currency,status,method,created_at,paid_at&order=created_at.desc&limit=20' }) }));
on('POST', /^\/billing\/manual$/, async (_, b) => rpc('cvc_submit_manual_payment', { p_plan: String(b.plan), p_months: Number(b.months) || 1, p_network: String(b.network), p_phone: String(b.phone || '').slice(0, 20), p_ref: String(b.ref || '').slice(0, 40) }));
on('POST', /^\/billing\/redeem$/, async (_, b) => {
  const r = await rpc('cvc_redeem', { p_code: String(b.code || '').slice(0, 40) });
  if (r?.error) throw new ApiError(r.message, 400, r.error);
  return { user: userView(r) };
});

// admin console (every call is re-checked in the database: the menu being visible proves nothing)
on('POST', /^\/admin\/stats$/, async (_, b) => rpc('cvc_admin_stats', { p_days: Number(b.days) || 30 }));
on('POST', /^\/admin\/users$/, async (_, b) => rpc('cvc_admin_users', { p_q: String(b.q || '').slice(0, 80), p_limit: 25, p_offset: Number(b.offset) || 0 }));
on('POST', /^\/admin\/payments$/, async () => ({ payments: await rpc('cvc_admin_payments', { p_limit: 100 }) }));
on('POST', /^\/admin\/payments\/review$/, async (_, b) => { await rpc('cvc_admin_review_payment', { p_id: String(b.id), p_approve: !!b.approve }); return { ok: true }; });
on('POST', /^\/admin\/codes$/, async () => ({ codes: await rpc('cvc_admin_codes') }));
on('POST', /^\/admin\/codes\/create$/, async (_, b) => ({ codes: await rpc('cvc_admin_create_codes', { p_plan: String(b.plan), p_days: Number(b.days), p_count: Number(b.count), p_max_uses: Number(b.maxUses) || 1, p_expires_at: b.expiresAt || null, p_note: String(b.note || '').slice(0, 200) }) }));
on('POST', /^\/admin\/codes\/active$/, async (_, b) => { await rpc('cvc_admin_set_code_active', { p_code: String(b.code), p_active: !!b.active }); return { ok: true }; });
on('POST', /^\/admin\/grant$/, async (_, b) => { await rpc('cvc_admin_grant', { p_user: String(b.userId), p_plan: String(b.plan), p_days: Number(b.days) || 0 }); return { ok: true }; });
on('POST', /^\/admin\/audit$/, async () => ({ events: await rpc('cvc_admin_audit', { p_limit: 100 }) }));

// auth
on('POST', /^\/auth\/login$/, async (_, b) => {
  await auth.signIn(String(b.email || '').trim().toLowerCase(), String(b.password || ''));
  return { user: await meUser() };
});
on('POST', /^\/auth\/signup$/, async (_, b) => {
  const r = await auth.signUp(String(b.email || '').trim().toLowerCase(), String(b.password || ''), text(b.name, 120).trim());
  if (r.alreadyExists) throw new ApiError(AUTH_MSG.user_already_exists, 409, 'user_already_exists');
  return r.signedIn ? { user: await meUser() } : { confirm: true };
});
on('POST', /^\/auth\/logout$/, async () => { await auth.signOut(); return { ok: true }; });
on('POST', /^\/auth\/forgot$/, async (_, b) => {
  try { await auth.recover(String(b.email || '').trim().toLowerCase()); } catch (e) { if (e.status === 429 || e.status === 0) throw e; } // never reveal whether an account exists
  return { ok: true };
});
on('POST', /^\/auth\/reset$/, async (_, b) => {
  if (!auth.hasSession()) throw new ApiError('This reset link has expired. Please request a new one.', 400, 'link_expired');
  if (String(b.password || '').length < 8) throw new ApiError('Password must be at least 8 characters.', 400, 'weak_password');
  await auth.updateUser({ password: String(b.password) });
  return { user: await meUser() };
});

// profile
on('GET', /^\/profile$/, async () => {
  await rpc('cvc_ensure_account');
  const row = one(await rest('GET', 'cvc_profiles', { query: 'select=content' }), 'Profile');
  return { content: cleanContent(row.content) };
});
on('PUT', /^\/profile$/, async (_, b) => {
  await rest('PATCH', 'cvc_profiles', { query: `user_id=eq.${uid()}`, body: { content: cleanContent(b.content) } });
  return { ok: true };
});

// resumes
const LIST_COLS = 'id,title,template,country,job,doc_id,certified_at,certified_hash,current_hash,updated_at,name:content->personal->>fullName';
on('GET', /^\/resumes$/, async () => {
  const rows = await rest('GET', 'cvc_resumes', { query: `select=${LIST_COLS}&order=updated_at.desc` });
  return { resumes: rows.map((r) => ({ id: r.id, title: r.title, template: r.template, country: r.country, jobTitle: r.job?.title || '', docId: r.doc_id || null, certifiedAt: r.certified_at || null, changedSinceCertified: stale(r), updatedAt: r.updated_at, name: r.name || '' })) };
});
on('POST', /^\/resumes$/, async (_, b) => {
  let content;
  if (b.fromResumeId) content = one(await rest('GET', 'cvc_resumes', { query: `select=content&${eq(b.fromResumeId)}` }), 'Resume').content;
  else content = one(await rest('GET', 'cvc_profiles', { query: 'select=content' }), 'Profile').content || emptyContent();
  const row = one(await rest('POST', 'cvc_resumes', { prefer: REP, body: { title: cleanTitle(b.title, 'My resume'), country: cleanCountry(b.country), template: cleanTemplate(b.template), content: cleanContent(content), job: cleanJob(b.job) } }), 'Resume');
  return { resume: resumeView(row) };
});
on('GET', /^\/resumes\/([^/]+)$/, async ([id]) => {
  const r = one(await rest('GET', 'cvc_resumes', { query: `select=*&${eq(id)}` }), 'Resume');
  return { resume: resumeView(r), changedSinceCertified: stale(r) };
});
on('PUT', /^\/resumes\/([^/]+)$/, async ([id], b) => {
  const upd = patchPick(b, { title: (v) => ['title', cleanTitle(v, 'My resume')], template: (v) => ['template', cleanTemplate(v)], country: (v) => ['country', cleanCountry(v)], content: (v) => ['content', cleanContent(v)], job: (v) => ['job', cleanJob(v)] });
  const r = one(await rest('PATCH', 'cvc_resumes', { query: eq(id), prefer: REP, body: upd }), 'Resume');
  return { resume: resumeView(r), changedSinceCertified: stale(r) };
});
on('DELETE', /^\/resumes\/([^/]+)$/, async ([id]) => {
  const r = one(await rest('GET', 'cvc_resumes', { query: `select=doc_id&${eq(id)}` }), 'Resume');
  if (r.doc_id) await rpc('cvc_revoke', { p_resume_id: id });
  await rest('DELETE', 'cvc_resumes', { query: eq(id) });
  return { ok: true };
});
on('POST', /^\/resumes\/([^/]+)\/certify$/, async ([id]) => {
  const c = await rpc('cvc_certify', { p_resume_id: id });
  return { resume: { docId: c.docId, certifiedAt: c.certifiedAt, certifiedHash: c.certifiedHash }, unchanged: !!c.unchanged };
});
on('POST', /^\/resumes\/([^/]+)\/revoke$/, async ([id]) => { await rpc('cvc_revoke', { p_resume_id: id }); return { ok: true }; });

// letters
on('GET', /^\/letters$/, async () => ({ letters: (await rest('GET', 'cvc_letters', { query: 'select=*&order=updated_at.desc' })).map(letterView) }));
const letterBody = (b) => ({ title: cleanTitle(b.title, 'Cover letter'), text: text(b.text, 8000), job: cleanJob(b.job), resume_id: b.resumeId || null, format: LETTER_FORMATS.some((f) => f.id === b.format) ? b.format : 'formal' });
on('POST', /^\/letters$/, async (_, b) => ({ letter: letterView(one(await rest('POST', 'cvc_letters', { prefer: REP, body: letterBody(b) }), 'Letter')) }));
on('PUT', /^\/letters\/([^/]+)$/, async ([id], b) => ({ letter: letterView(one(await rest('PATCH', 'cvc_letters', { query: eq(id), prefer: REP, body: letterBody(b) }), 'Letter')) }));
on('DELETE', /^\/letters\/([^/]+)$/, async ([id]) => { await rest('DELETE', 'cvc_letters', { query: eq(id) }); return { ok: true }; });

// portfolio
on('GET', /^\/portfolio$/, async () => ({ portfolio: portfolioView((await rest('GET', 'cvc_portfolios', { query: 'select=*' }))[0]) }));
on('PUT', /^\/portfolio$/, async (_, b) => {
  const slug = cleanSlug(b.slug);
  if (b.enabled && slug.length < 3) throw new ApiError('Choose a web address of at least 3 letters, numbers or hyphens.', 400, 'bad_slug');
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 8).map((l) => ({ label: text(l?.label, 60).trim(), url: text(l?.url, 300).trim() })).filter((l) => l.label && /^https?:\/\//i.test(l.url));
  const body = { enabled: !!b.enabled, slug: slug || null, headline: text(b.headline, 160).trim(), about: text(b.about, 1500).trim(), links, resume_id: b.resumeId || null };
  const row = one(await rest('POST', 'cvc_portfolios', { query: 'on_conflict=user_id', prefer: `${REP},resolution=merge-duplicates`, body }), 'Portfolio');
  return { portfolio: portfolioView(row) };
});

// public pages
on('GET', /^\/verify\/([^/]+)$/, async ([id]) => {
  const d = await rpc('cvc_verify', { p_id: decodeURIComponent(id) }, { anon: true });
  if (!d) throw new ApiError('No document with that ID was found. Check the ID and try again.', 404, 'not_found');
  return d;
});
on('GET', /^\/p\/([^/]+)$/, async ([slug]) => {
  const d = await rpc('cvc_public_portfolio', { p_slug: decodeURIComponent(slug) }, { anon: true });
  if (!d) throw new ApiError('This portfolio does not exist.', 404, 'not_found');
  return d;
});

// AI + scoring (Edge Function)
on('POST', /^\/ai\/([a-z]+)$/, async ([task], b) => {
  try {
    return await fn('cvc-api', { task, ...b });
  } catch (e) {
    if (e instanceof SbError && e.status === 404) throw new ApiError('The AI service is not available right now.', 503, 'unavailable');
    throw e;
  }
});

export async function handle(method, path, body) {
  const clean = path.split('?')[0];
  for (const [m, re, run] of routes) {
    if (m !== method) continue;
    const match = re.exec(clean);
    if (match) {
      try { return await run(match.slice(1), body); } catch (e) { throw fail(e); }
    }
  }
  throw new ApiError('Not found.', 404, 'not_found');
}

/* ---------- client-side Word export ---------- */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const fileSafe = (s, fb) => (String(s || '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || fb);

export async function downloadFile(path, fallbackName) {
  let lib;
  try { lib = await import('./docx-export.js'); } catch { throw new ApiError('The Word exporter could not be loaded. Check your connection, or use Print / PDF instead.', 0, 'network'); }
  try {
    let m = /^\/resumes\/([^/]+)\/export$/.exec(path);
    if (m) {
      const r = one(await rest('GET', 'cvc_resumes', { query: `select=*&${eq(m[1])}` }), 'Resume');
      const blob = await lib.resumeToDocx({ content: cleanContent(r.content), template: r.template, country: r.country, docId: r.doc_id, verifyUrl: r.doc_id ? appUrl('/verify/' + r.doc_id) : '' });
      return saveBlob(blob, `${fileSafe(r.content?.personal?.fullName, 'Resume')}_${fileSafe(r.title, 'resume')}.docx`);
    }
    m = /^\/letters\/([^/]+)\/export$/.exec(path);
    if (m) {
      const l = one(await rest('GET', 'cvc_letters', { query: `select=*&${eq(m[1])}` }), 'Letter');
      const src = l.resume_id ? (await rest('GET', 'cvc_resumes', { query: `select=content&${eq(l.resume_id)}` }))[0] : (await rest('GET', 'cvc_profiles', { query: 'select=content' }))[0];
      return saveBlob(await lib.letterToDocx({ text: l.text, name: l.title, personal: cleanContent(src?.content).personal, job: l.job || {}, format: l.format || 'formal' }), `${fileSafe(l.title, 'cover-letter')}.docx`);
    }
  } catch (e) {
    throw fail(e);
  }
  throw new ApiError('Download failed.', 400, 'bad_request');
}
