import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const newId = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');

// Crockford-ish base32 without ambiguous characters, used for public document IDs.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function newDocId() {
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `CVC-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export const normalizeDocId = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^CVC/, '')
    .replace(/^(.{4})(.{4})(.{4}).*$/, 'CVC-$1-$2-$3');

export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const nowIso = () => new Date().toISOString();

export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const siteUrl = (req) => {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
};
