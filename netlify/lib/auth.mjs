import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { HttpError } from './util.mjs';
import { db } from './db.mjs';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'cv_session';
const SESSION_DAYS = 30;

/* ---------- passwords ---------- */

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

export function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.', 'weak_password');
  if (pw.length > 200) throw new HttpError(400, 'Password is too long.', 'weak_password');
}

/* ---------- signed tokens (HS256 JWT-style) ---------- */

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NETLIFY || process.env.NODE_ENV === 'production') {
    throw new HttpError(500, 'Server is missing SESSION_SECRET. Set it in the environment variables.', 'misconfigured');
  }
  return 'dev-only-insecure-secret-change-me';
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const mac = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function signToken(payload, ttlSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const data = `${head}.${b64(body)}`;
  return `${data}.${mac(data)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = Buffer.from(mac(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!body.exp || body.exp < Date.now() / 1000) return null;
    return body;
  } catch {
    return null;
  }
}

/* ---------- cookies / sessions ---------- */

const parseCookies = (header) =>
  Object.fromEntries(
    String(header || '')
      .split(';')
      .map((p) => p.trim().split('='))
      .filter((p) => p[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]),
  );

const isSecure = (req) => {
  try {
    return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
  } catch {
    return false;
  }
};

export function sessionCookie(req, user) {
  const token = signToken({ sub: user.id, v: user.sessionVersion || 0 }, SESSION_DAYS * 86400);
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${isSecure(req) ? '; Secure' : ''}`;
}

export const clearCookie = (req) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure(req) ? '; Secure' : ''}`;

export async function getSessionUser(req) {
  const token = parseCookies(req.headers.get('cookie'))[COOKIE];
  const payload = verifyToken(token);
  if (!payload || payload.purpose) return null;
  const user = await db.get('users', payload.sub);
  if (!user || (user.sessionVersion || 0) !== (payload.v || 0)) return null;
  return user;
}

/* ---------- best-effort login throttling (per server instance) ---------- */

const attempts = new Map();
export function throttle(key, limit = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const rec = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (rec.length >= limit) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', 'rate_limited');
  rec.push(now);
  attempts.set(key, rec);
}
export const clearThrottle = (key) => attempts.delete(key);
