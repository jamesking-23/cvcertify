// Tier 2: the shared semantic answer cache (table cvc_response_cache, see migration 20261127_response_cache.sql).
// `admin` is a service-role Supabase client; the browser can never reach this table.
//
// Rules that keep a cache shared between users safe and correct:
//  - questions with dynamic personal numbers, or that need the person's own profile, are never read from or written to it;
//  - a hit needs vector similarity >= 0.90, the same extracted conditions (country), a plain-words similarity check
//    (so a forged vector cannot attach an answer to an unrelated question), and every source fact still unchanged.

import { embed as hashedVec } from './router.mjs';
import { extractCountry } from './actions.mjs';
import { refsAreCurrent } from './knowledge.mjs';

export const TIER2_MIN_SIMILARITY = 0.9;
export const CACHE_CAP = 10000;
export const DIM = 384;
const LEXICAL_MIN = 0.2;

const ACT_ON_MINE = /\b(review|check|improve|rewrite|fix|score|rate|critique|proofread|edit|tailor|update|polish)\b.{0,25}\bmy\b/i;
const MY_DATA = /\bmy (profile|summary|experience|work history|skills|education|name|score|bullets?)\b/i;
const ABOUT_ME = /\b(i am|i'm|im|i have been|i worked|i work|i studied|i graduated)\b/i;

/** Personal = has digits (dynamic numbers), or needs the person's own data. Personal questions skip the shared cache. */
export const isPersonal = (message) => /\d/.test(message) || ACT_ON_MINE.test(message) || MY_DATA.test(message) || ABOUT_ME.test(message);
export const isCacheable = (message) => !isPersonal(String(message || ''));

/** Conditions that change the right answer and so must match on a cache hit. */
export const conditionKey = (message) => { const c = extractCountry(message); return c ? `country:${c.id}` : ''; };

/** Accepts only a finite 384-number vector; returns it L2-normalised, or null. */
export function normaliseEmbedding(v) {
  if (!Array.isArray(v) && !(v instanceof Float32Array)) return null;
  if (v.length !== DIM) return null;
  let n = 0;
  for (let i = 0; i < DIM; i++) { if (typeof v[i] !== 'number' || !Number.isFinite(v[i])) return null; n += v[i] * v[i]; }
  n = Math.sqrt(n);
  if (n < 0.5 || n > 2) return null; // a real bge vector is unit length
  return Array.from(v, (x) => x / n);
}
export const vectorLiteral = (v) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const lexicalSimilarity = (a, b) => dot(hashedVec(a), hashedVec(b));

/** @returns {Promise<{id:string, reply:string, similarity:number}|null>} */
export async function lookupCache(admin, { message, vector, conditions = '' }) {
  const { data, error } = await admin.rpc('cvc_cache_lookup', { p_embedding: vectorLiteral(vector), p_min: TIER2_MIN_SIMILARITY, p_conditions: conditions, p_limit: 3 });
  if (error) { console.error('cache lookup failed', error.message); return null; }
  const stale = [];
  let hit = null;
  for (const row of data || []) {
    if (!refsAreCurrent(row.source_fact_ids)) { stale.push(row.id); continue; }
    if (lexicalSimilarity(message, row.query_text) < LEXICAL_MIN) continue;
    hit = { id: row.id, reply: row.response_text, similarity: row.similarity };
    break;
  }
  if (stale.length) await admin.rpc('cvc_cache_delete', { p_ids: stale });
  if (hit) await admin.rpc('cvc_cache_touch', { p_id: hit.id }); // last_used_at for LRU
  return hit;
}

/** Saves { query_text, embedding_vector, response_text, source_fact_ids, created_at, last_used_at }; trims to the LRU cap. */
export async function storeCache(admin, { message, vector, reply, factRefs = [], conditions = '' }) {
  const { error } = await admin.rpc('cvc_cache_store', { p_query: message, p_embedding: vectorLiteral(vector), p_response: reply, p_facts: factRefs, p_conditions: conditions, p_cap: CACHE_CAP });
  if (error) console.error('cache store failed', error.message);
  return !error;
}

/** Cleanup helper: keeps the newest-used `cap` entries and deletes the rest. Returns how many were removed. */
export async function pruneCache(admin, cap = CACHE_CAP) {
  let removed = 0;
  for (;;) {
    const { data, error } = await admin.from('cvc_response_cache').select('id').order('last_used_at', { ascending: true }).range(cap, cap + 499);
    if (error || !data?.length) return removed;
    const { data: n } = await admin.rpc('cvc_cache_delete', { p_ids: data.map((r) => r.id) });
    removed += Number(n) || 0;
    if (data.length < 500) return removed;
  }
}

/** Call when a source fact changes (or is removed): deletes every cached answer built from it. Returns the count. */
export async function invalidateCacheByFact(admin, factId) {
  const { data, error } = await admin.rpc('cvc_cache_invalidate_fact', { p_fact_id: String(factId) });
  if (error) { console.error('cache invalidate failed', error.message); return 0; }
  return Number(data) || 0;
}
