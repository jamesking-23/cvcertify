#!/usr/bin/env node
// Build step: fetches the quantized bge-small-en-v1.5 model (about 33 MB) and the Transformers.js runtime into public/,
// so the site serves them itself and the browser never contacts Hugging Face or a CDN.
//   public/models/Xenova/bge-small-en-v1.5/...   model files
//   public/vendor/transformers/...                transformers.js + onnxruntime wasm
// Run: npm run model   (needs internet once; the deploy workflow runs it). Re-running skips files already present.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const REPO = 'Xenova/bge-small-en-v1.5';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];

async function download(file) {
  const dest = path.join(PUBLIC, 'models', REPO, file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { console.log(`have  ${file}`); return; }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(`https://huggingface.co/${REPO}/resolve/main/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`got   ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

function copyRuntime() {
  let pkgDir;
  try { pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@huggingface', 'transformers'); if (!fs.existsSync(path.join(pkgDir, 'package.json'))) throw new Error('missing'); } catch { throw new Error('Run "npm install" first: @huggingface/transformers is missing.'); }
  const dist = path.join(pkgDir, 'dist');
  const out = path.join(PUBLIC, 'vendor', 'transformers');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(dist)) {
    if (/\.(map|ts)$/.test(f) || !fs.statSync(path.join(dist, f)).isFile()) continue;
    fs.copyFileSync(path.join(dist, f), path.join(out, f));
  }
  // The browser imports one fixed name; use the first bundle this version ships.
  const entry = ['transformers.web.min.js', 'transformers.web.js', 'transformers.min.js', 'transformers.js'].find((f) => fs.existsSync(path.join(dist, f)));
  if (!entry) throw new Error('No Transformers.js browser bundle found in dist/.');
  fs.copyFileSync(path.join(dist, entry), path.join(out, 'transformers.js'));
  console.log(`runtime: ${fs.readdirSync(out).length} files, entry ${entry}`);
}

try {
  for (const f of FILES) await download(f);
  copyRuntime();
} catch (e) {
  console.error(`download-model failed: ${e.message}`);
  process.exit(1);
}
