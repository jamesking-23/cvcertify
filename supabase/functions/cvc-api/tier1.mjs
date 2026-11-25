// Tier 1 of the assistant: the on-device intent router. Pure JavaScript, no network.
//
// An "embedder" turns text into a vector. Two are supported and both plug into the same router:
//   - bge-small-en-v1.5 (neural, loaded in the browser by public/js/assistant/bge.js), cosine >= 0.72 runs a command;
//   - hashed-ngram (built in, no download), used while the model is still loading or if it cannot load.
// The router only decides WHICH deterministic action in actions.mjs runs. It also hands back the query vector so Tier 2
// (the shared answer cache) can reuse it without embedding the message again.

import { INTENTS, routingText, embed as hashedVec, confidence as hashedConfidence, DEFAULT_THRESHOLD } from './router.mjs';
import { fallback, matchOverride, runIntent } from './actions.mjs';

export const BGE_THRESHOLD = 0.72;
export const BGE_MODEL = 'bge-small-en-v1.5';

export const hashedEmbedder = { id: 'hashed-ngram', threshold: DEFAULT_THRESHOLD, score: hashedConfidence, embed: async (t) => hashedVec(t) };

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Short fingerprint of the phrase bank, so precomputed vectors are only trusted while the bank is unchanged. */
export function bankHash(bank = INTENTS) {
  let h = 2166136261;
  for (const c of JSON.stringify(bank)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

/**
 * @param {{ id: string, threshold: number, score?: (cosine:number)=>number, embed: (text:string)=>Promise<Float32Array|number[]> }} embedder
 * @param {{ bank?: Record<string,string[]>, precomputed?: { model: string, hash: string, vectors: Record<string, number[][]> } | null }} [opts]
 */
export function createRouter(embedder, { bank = INTENTS, precomputed = null } = {}) {
  const score = embedder.score || ((c) => c);
  let index = [];
  const ready = (async () => {
    const usable = precomputed && precomputed.model === embedder.id && precomputed.hash === bankHash(bank);
    for (const [intent, phrases] of Object.entries(bank)) {
      for (let i = 0; i < phrases.length; i++) {
        const vec = usable && precomputed.vectors[intent]?.[i] ? Float32Array.from(precomputed.vectors[intent][i]) : await embedder.embed(phrases[i]);
        index.push({ intent, phrase: phrases[i], vec });
      }
    }
    return { fromPrecomputed: !!usable, phrases: index.length };
  })();

  async function classify(message) {
    await ready;
    const vec = Float32Array.from(await embedder.embed(routingText(message)));
    const best = new Map();
    for (const e of index) {
      const s = dot(vec, e.vec);
      if (!best.has(e.intent) || s > best.get(e.intent).cosine) best.set(e.intent, { intent: e.intent, cosine: s, phrase: e.phrase });
    }
    const ranked = [...best.values()].map((r) => ({ ...r, confidence: score(r.cosine) })).sort((a, b) => b.cosine - a.cosine);
    return { ranked, vec, text: routingText(message) };
  }

  /** @returns {Promise<{matched:boolean, reply:string, intent:string|null, confidence:number, embedding:Float32Array|null, text:string, ms:number}>} */
  async function handle(message, ctx = {}, { minConfidence = embedder.threshold } = {}) {
    const started = performance.now();
    const text = String(message || '').trim();
    const done = (o) => ({ embedding: null, text: '', ...o, ms: Math.round((performance.now() - started) * 100) / 100 });
    if (!text) return done({ matched: false, reply: fallback(), intent: null, confidence: 0 });
    const cue = matchOverride(text);
    if (cue) return done({ matched: true, reply: runIntent(cue, text, ctx), intent: cue, confidence: 1, text });
    const { ranked, vec, text: routed } = await classify(text);
    const top = ranked[0];
    if (!top || top.confidence < minConfidence) return done({ matched: false, reply: fallback(), intent: null, confidence: top ? top.confidence : 0, embedding: vec, text: routed });
    return done({ matched: true, reply: runIntent(top.intent, text, ctx), intent: top.intent, confidence: top.confidence, embedding: vec, text: routed });
  }

  return { id: embedder.id, threshold: embedder.threshold, ready, classify, handle };
}
