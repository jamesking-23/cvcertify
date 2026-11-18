// A minimal Supabase client (Auth + PostgREST + Edge Functions) on plain fetch. No CDN, no dependencies.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export class SbError extends Error {
  constructor(message, status, code, hint) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

const STORE = 'cvc.session';
let session = null;
try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { /* storage unavailable */ }
const persist = (s) => {
  session = s;
  try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch { /* ignore */ }
};
const now = () => Math.floor(Date.now() / 1000);
const toSession = (d) => (d?.access_token ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || now() + (d.expires_in || 3600), user: d.user || session?.user || null } : null);

async function raw(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method,
      headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SbError('Could not reach the server. Check your connection and try again.', 0, 'network');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) throw new SbError(data?.message || data?.msg || data?.error_description || data?.error || `Request failed (${res.status}).`, res.status, data?.error_code || data?.code || data?.error, data?.hint);
  return data;
}

let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) return null;
  refreshing ||= raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then((d) => { persist(toSession(d)); return session; })
    .catch((e) => { if (e.status >= 400 && e.status < 500) persist(null); return e.status === 0 ? session : null; })
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function accessToken() {
  if (!session) return null;
  if (session.expires_at - now() < 60) await refresh();
  return session?.access_token || null;
}

async function authed(path, opts = {}) {
  let token = await accessToken();
  if (!token) throw new SbError('Please sign in to continue.', 401, 'unauthenticated');
  try {
    return await raw(path, { ...opts, token });
  } catch (e) {
    if (e.status === 401 && (await refresh())) return raw(path, { ...opts, token: session.access_token });
    if (e.status === 401) throw new SbError('Your session expired. Please sign in again.', 401, 'unauthenticated');
    throw e;
  }
}

/* ---------- auth ---------- */
const here = () => location.origin + location.pathname;
export const auth = {
  user: () => session?.user || null,
  hasSession: () => !!session,
  settings: () => raw('/auth/v1/settings'),
  async signUp(email, password, name) {
    const d = await raw('/auth/v1/signup?redirect_to=' + encodeURIComponent(here()), { method: 'POST', body: { email, password, data: { name } } });
    if (d?.access_token) { persist(toSession(d)); return { signedIn: true }; }
    return { signedIn: false, alreadyExists: Array.isArray(d?.identities) && d.identities.length === 0 };
  },
  async signIn(email, password) {
    persist(toSession(await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })));
  },
  async signOut() {
    const token = session?.access_token;
    persist(null);
    if (token) { try { await raw('/auth/v1/logout', { method: 'POST', token }); } catch { /* already gone */ } }
  },
  recover: (email) => raw('/auth/v1/recover?redirect_to=' + encodeURIComponent(here()), { method: 'POST', body: { email } }),
  updateUser: (attrs) => authed('/auth/v1/user', { method: 'PUT', body: attrs }),
  googleUrl: () => `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(here())}`,
  // Email links and OAuth return tokens in the URL fragment. Consume them before the router sees the hash.
  takeRedirect() {
    const h = location.hash.slice(1);
    if (!/(^|&)(access_token|error)=/.test(h)) return null;
    const p = new URLSearchParams(h);
    history.replaceState(null, '', here() + location.search);
    if (p.get('error')) return { error: (p.get('error_description') || p.get('error')).replace(/\+/g, ' ') };
    persist(toSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600, expires_at: Number(p.get('expires_at')) || undefined }));
    return { type: p.get('type') || 'signin' };
  },
};

/* ---------- data ---------- */
export const rest = (method, table, { query = '', body, prefer } = {}) =>
  authed(`/rest/v1/${table}${query ? '?' + query : ''}`, { method, body, headers: { Accept: 'application/json', ...(prefer ? { Prefer: prefer } : {}) } });

export async function rpc(name, args = {}, { anon = false } = {}) {
  const path = `/rest/v1/rpc/${name}`;
  if (anon && !session) return raw(path, { method: 'POST', body: args });
  return authed(path, { method: 'POST', body: args });
}

export const fn = (name, body) => authed(`/functions/v1/${name}`, { method: 'POST', body });
