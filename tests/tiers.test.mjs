import test from 'node:test';
import assert from 'node:assert/strict';

const { ask, OFFLINE_REPLY, UNAVAILABLE_REPLY } = await import('../supabase/functions/cvc-api/ask.mjs');
const C = await import('../supabase/functions/cvc-api/cache.mjs');
const K = await import('../supabase/functions/cvc-api/knowledge.mjs');

// An in-memory stand-in for the cache RPCs, so the tier logic is tested without a database.
function fakeAdmin() {
  const rows = []; const log = [];
  let n = 0;
  return {
    rows, log,
    rpc: async (fn, a) => {
      log.push(fn);
      if (fn === 'cvc_cache_lookup') return { data: rows.filter((r) => r.conditions === a.p_conditions).map((r) => ({ id: r.id, query_text: r.query, response_text: r.response, source_fact_ids: r.facts, similarity: 0.95 })) };
      if (fn === 'cvc_cache_store') { rows.push({ id: String(++n), query: a.p_query, response: a.p_response, facts: a.p_facts, conditions: a.p_conditions, last_used_at: Date.now() }); return { data: String(n) }; }
      if (fn === 'cvc_cache_touch') { const r = rows.find((x) => x.id === a.p_id); if (r) r.last_used_at = Date.now(); return { data: null }; }
      if (fn === 'cvc_cache_delete') { for (const id of a.p_ids) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); } return { data: a.p_ids.length }; }
      return { data: null };
    },
  };
}
const vec = Array.from({ length: 384 }, (_, i) => (i === 7 ? 1 : 0));
const gemini = () => { const f = async () => { f.calls++; return 'Be honest and brief about the gap.'; }; f.calls = 0; return f; };

test('Tier 3 answers with Gemini and writes the answer to the cache; Tier 2 then serves a similar question for free', async () => {
  const admin = fakeAdmin(); const generate = gemini(); const deps = { enabled: () => true, generate };
  const a = await ask({ admin, message: 'how do i explain a gap in my cv', embedding: vec }, deps);
  assert.deepEqual([a.tier, a.cached, generate.calls, admin.rows.length], [3, false, 1, 1]);
  assert.ok(admin.rows[0].facts.some((f) => f.startsWith('cv-gaps:')), 'the answer records which facts it came from');
  const b = await ask({ admin, message: 'how to explain employment gap on resume', embedding: vec }, deps);
  assert.deepEqual([b.tier, b.cached, generate.calls], [2, true, 1]);
  assert.equal(b.reply, a.reply);
  assert.ok(admin.log.includes('cvc_cache_touch'), 'last_used_at is refreshed on a hit');
});

test('personal questions and questions with numbers never touch the shared cache', async () => {
  for (const q of ['review my cv please', 'is 3 years enough experience', 'i am a nurse how do i start']) assert.equal(C.isCacheable(q), false, q);
  const admin = fakeAdmin(); const generate = gemini();
  const out = await ask({ admin, message: 'review my cv please', embedding: vec, content: { personal: { fullName: 'A B' }, skills: ['x'] } }, { enabled: () => true, generate });
  assert.equal(out.tier, 3);
  assert.equal(admin.rows.length, 0);
  assert.ok(!admin.log.includes('cvc_cache_lookup'));
});

test('a forged vector cannot attach an answer to an unrelated question', async () => {
  const admin = fakeAdmin(); const generate = gemini(); const deps = { enabled: () => true, generate };
  await ask({ admin, message: 'how do i explain a gap in my cv', embedding: vec }, deps);
  const out = await ask({ admin, message: 'best recipe for pancakes', embedding: vec }, deps);
  assert.equal(out.tier, 3, 'plain-words check rejects the cached answer');
});

test('extracted conditions must match: a Uganda answer is not served for a Canada question', async () => {
  assert.equal(C.conditionKey('cv format in uganda'), 'country:AF');
  assert.equal(C.conditionKey('cv format in canada'), 'country:CA');
  const admin = fakeAdmin(); const generate = gemini(); const deps = { enabled: () => true, generate };
  await ask({ admin, message: 'what cv format should i use in uganda', embedding: vec }, deps);
  const out = await ask({ admin, message: 'what cv format should i use in canada', embedding: vec }, deps);
  assert.equal(out.tier, 3);
});

test('changing a source fact makes cached answers stale and they are dropped', async () => {
  const admin = fakeAdmin(); const generate = gemini(); const deps = { enabled: () => true, generate };
  await ask({ admin, message: 'how do i explain a gap in my cv', embedding: vec }, deps);
  admin.rows[0].facts = ['cv-gaps:00000000']; // as if the fact text had been edited since
  const out = await ask({ admin, message: 'how to explain employment gap on resume', embedding: vec }, deps);
  assert.equal(out.tier, 3);
  assert.equal(generate.calls, 2);
  assert.equal(K.refsAreCurrent(K.FACTS.map(K.factRef)), true);
  assert.equal(K.refsAreCurrent(['cv-gaps:00000000']), false);
});

test('no internet or no key: a friendly message, never an error or a crash', async () => {
  const admin = fakeAdmin();
  const down = await ask({ admin, message: 'how long should a cv be', embedding: vec }, { enabled: () => true, generate: async () => { throw new Error('fetch failed'); } });
  assert.deepEqual([down.offline, down.reply], [true, OFFLINE_REPLY]);
  assert.equal(admin.rows.length, 0, 'failed answers are not cached');
  const off = await ask({ admin, message: 'how long should a cv be', embedding: vec }, { enabled: () => false });
  assert.deepEqual([off.unavailable, off.reply], [true, UNAVAILABLE_REPLY]);
});

test('bad vectors are ignored, not trusted', () => {
  assert.equal(C.normaliseEmbedding([1, 2, 3]), null);
  assert.equal(C.normaliseEmbedding(Array(384).fill(NaN)), null);
  assert.equal(C.normaliseEmbedding(Array(384).fill(0)), null);
  assert.equal(C.normaliseEmbedding(vec).length, 384);
});

test('cleanup helpers: LRU prune keeps the cap, invalidateCacheByFact reports what it removed', async () => {
  const calls = [];
  const admin = {
    from: () => ({ select: () => ({ order: () => ({ range: async (a, b) => (calls.push(['range', a, b]), { data: a === 10000 ? [{ id: 'x' }, { id: 'y' }] : [] }) }) }) }),
    rpc: async (fn, a) => (calls.push([fn, a]), { data: fn === 'cvc_cache_invalidate_fact' ? 3 : (a.p_ids || []).length }),
  };
  assert.equal(await C.pruneCache(admin), 2);
  assert.deepEqual(calls[0], ['range', 10000, 10499]);
  assert.equal(await C.invalidateCacheByFact(admin, 'salary'), 3);
  assert.equal(C.CACHE_CAP, 10000);
  assert.equal(C.TIER2_MIN_SIMILARITY, 0.9);
});
