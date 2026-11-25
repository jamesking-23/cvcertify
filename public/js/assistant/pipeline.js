// The assistant's three tiers, as seen from the browser.
//   Tier 1  on this device: bge-small intent router -> deterministic functions (no network).
//   Tier 2  shared answer cache, on the server, reusing Tier 1's vector.
//   Tier 3  Gemini on the server, then the answer is cached.
// Tiers 2 and 3 are one request (/ai/ask). If the model cannot load, a built-in matcher keeps Tier 1 working.
import { createRouter, hashedEmbedder, BGE_MODEL } from '../shared/tier1.mjs';
import { loadBge, loadPrecomputed } from './bge.js';
import { post, get } from '../api.js';

export const OFFLINE_REPLY = 'You seem to be offline, so I can only help with the built-in commands for now (calculations, profile checks, CV formats and tips). Type "help" to see them, and ask again when you are back online.';

const fallbackRouter = createRouter(hashedEmbedder);
let neural = null, loading = null, profile = null;
export const modelState = { status: 'idle' }; // idle | loading | ready | unavailable

/** Start loading the on-device model in the background. Safe to call many times. */
export function warmUp() {
  if (loading) return loading;
  modelState.status = 'loading';
  loading = (async () => {
    try {
      const embedder = await loadBge();
      const router = createRouter(embedder, { precomputed: await loadPrecomputed() });
      await router.ready;
      neural = router;
      modelState.status = 'ready';
    } catch (e) {
      console.warn('On-device model unavailable, using the built-in matcher.', e);
      modelState.status = 'unavailable';
    }
  })();
  return loading;
}
const current = () => neural || fallbackRouter;

async function getProfile() {
  if (!profile) { try { profile = (await get('/profile')).content; } catch { profile = {}; } }
  return profile;
}

/** @returns {Promise<{reply:string, tier:1|2|3, offline?:boolean}>} */
export async function ask(text, history = []) {
  const router = current();
  const content = await getProfile();
  const t1 = await router.handle(text, { content });
  if (t1.matched) return { reply: t1.reply, tier: 1 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { reply: OFFLINE_REPLY, tier: 3, offline: true };
  const embedding = router.id === BGE_MODEL && t1.embedding ? Array.from(t1.embedding, (x) => Math.round(x * 1e6) / 1e6) : undefined;
  try {
    const out = await post('/ai/ask', { message: text, history, embedding });
    return { reply: out.reply, tier: out.tier || 3 };
  } catch (e) {
    if (e?.code === 'network' || e?.status === 0 || e?.status === 503) return { reply: OFFLINE_REPLY, tier: 3, offline: true };
    throw e;
  }
}
