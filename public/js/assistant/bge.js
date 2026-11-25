// Loads the bge-small-en-v1.5 embedding model (quantized, about 33 MB) with Transformers.js, entirely from files served by
// this site: no Hugging Face, no CDN. scripts/download-model.js puts the model in /models and the runtime in /vendor/transformers
// when the site is built. Remote models are switched off, so nothing here can reach the internet.
import { BGE_MODEL, BGE_THRESHOLD } from '../shared/tier1.mjs';

const ROOT = new URL('../../', import.meta.url); // the site's public folder
const here = (p) => new URL(p, ROOT).href;

export async function loadBge() {
  const tf = await import(here('vendor/transformers/transformers.js'));
  tf.env.allowRemoteModels = false;
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = here('models/');
  tf.env.backends.onnx.wasm.wasmPaths = here('vendor/transformers/');
  tf.env.backends.onnx.wasm.numThreads = 1; // multi-threading needs cross-origin isolation, which static hosting does not give
  const extractor = await tf.pipeline('feature-extraction', `Xenova/${BGE_MODEL}`, { dtype: 'q8', device: 'wasm' });
  const embed = async (text) => { const out = await extractor(String(text), { pooling: 'cls', normalize: true }); return Float32Array.from(out.data); };
  await embed('warm up'); // first call compiles the wasm; do it now so the first real message is fast
  return { id: BGE_MODEL, threshold: BGE_THRESHOLD, embed };
}

/** Intent vectors computed at build time (scripts/build-intents.mjs). Missing file is fine: they are computed on load instead. */
export async function loadPrecomputed() {
  try { const r = await fetch(here('models/intents.bge.json')); return r.ok ? await r.json() : null; } catch { return null; }
}
