// Build step (after download-model.js): embeds every INTENTS phrase once with the local model and saves the vectors, so the
// browser only has to embed the user's message. Offline: remote models are disabled.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { INTENTS } from '../supabase/functions/cvc-api/router.mjs';
import { bankHash, BGE_MODEL } from '../supabase/functions/cvc-api/tier1.mjs';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const tf = await import('@huggingface/transformers');
tf.env.allowRemoteModels = false;
tf.env.allowLocalModels = true;
tf.env.localModelPath = path.join(PUBLIC, 'models') + path.sep;

const extractor = await tf.pipeline('feature-extraction', `Xenova/${BGE_MODEL}`, { dtype: 'q8' });
const vectors = {};
let n = 0;
for (const [intent, phrases] of Object.entries(INTENTS)) {
  vectors[intent] = [];
  for (const p of phrases) {
    const out = await extractor(p, { pooling: 'cls', normalize: true });
    vectors[intent].push(Array.from(out.data, (x) => Math.round(x * 1e5) / 1e5));
    n++;
  }
}
mkdirSync(path.join(PUBLIC, 'models'), { recursive: true });
writeFileSync(path.join(PUBLIC, 'models', 'intents.bge.json'), JSON.stringify({ model: BGE_MODEL, hash: bankHash(INTENTS), dim: 384, vectors }));
console.log(`embedded ${n} phrases with ${BGE_MODEL}`);
