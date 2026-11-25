// Tier 3: Google Gemini, used only when Tier 1 (on-device commands) and Tier 2 (shared answer cache) both miss.
// The key comes from the GEMINI_API_KEY secret, never from code. Without it, or without internet, ask.mjs answers politely instead.

import { HttpError, env } from './util.mjs';

export const aiEnabled = () => !!env('GEMINI_API_KEY');
// Google Gemini (free tier). Key comes from the GEMINI_API_KEY secret, never from code.
// Models get retired, hang or hit their own free-tier limits, so calls are "hedged": start the best model, and if it has not
// answered in a few seconds start the next one alongside it. The first good answer wins and the rest are cancelled.
const MODELS = ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];
const FAST = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];
const HEDGE_MS = Number(env('AI_HEDGE_MS')) || 6000;
const TIMEOUT_MS = 28000;
let goodModel = null;
const cooldown = new Map(); // model -> time until which we skip it after it hung or failed
const modelList = (fast) => {
  const all = [...new Set([env('GEMINI_MODEL'), ...(fast ? FAST : [goodModel]), ...MODELS].filter(Boolean))];
  const ready = all.filter((m) => !(cooldown.get(m) > Date.now()));
  return ready.length ? ready : all;
};

async function callGemini(model, { system, user, maxTokens, temperature, json }, withThinking, signal) {
  // Newer models "think" before answering and that counts against the output budget, so leave generous room.
  const generationConfig = { maxOutputTokens: Math.max(maxTokens * 3, 4096) };
  if (model.startsWith('gemini-2')) generationConfig.temperature = Math.min(temperature, 2);
  if (withThinking && /^gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  if (json) generationConfig.responseMimeType = 'application/json';
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  });
}

// One model, start to finish. Throws { status, timeout } on failure.
async function attemptModel(model, args, signal) {
  let res;
  try {
    res = await callGemini(model, args, true, signal);
    if (res.status === 400) res = await callGemini(model, args, false, signal); // an option this model does not accept: retry plain
  } catch (e) {
    if (signal.aborted) throw { status: 0, cancelled: true };
    console.error('Gemini network error', model, String(e).slice(0, 120));
    throw { status: 0, timeout: true };
  }
  if (!res.ok) {
    console.error('Gemini error', model, res.status, (await res.text().catch(() => '')).slice(0, 200));
    throw { status: res.status };
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
  if (!text) { console.error('Gemini empty answer', model, data.candidates?.[0]?.finishReason); throw { status: 0 }; }
  return text;
}

export function generate({ system, user, maxTokens = 2000, temperature = 0.8, json = false, fast = false }) {
  const args = { system, user, maxTokens, temperature, json };
  const models = modelList(fast);
  const ctrl = new AbortController();
  return new Promise((resolve, reject) => {
    let next = 0, pending = 0, lastStatus = 0, done = false, timer = null;
    const finish = (fn, v) => { done = true; clearTimeout(timer); ctrl.abort(); fn(v); };
    const launch = () => {
      if (done || next >= models.length) return false;
      const model = models[next++];
      pending++;
      attemptModel(model, args, ctrl.signal).then((text) => {
        if (done) return;
        goodModel = model;
        finish(resolve, text);
      }).catch((e) => {
        pending--;
        if (done || e?.cancelled) return;
        lastStatus = e?.status || lastStatus;
        if (e?.timeout || e?.status === 404 || e?.status === 429 || e?.status >= 500) cooldown.set(model, Date.now() + 10 * 60 * 1000);
        if (!launch() && pending === 0) finish(reject, new HttpError(502, lastStatus === 429 ? 'The AI service is busy right now.' : 'The AI service is not available right now.', 'ai_error'));
      });
      clearTimeout(timer);
      if (next < models.length) timer = setTimeout(launch, HEDGE_MS); // slow? bring in the next model alongside
      return true;
    };
    launch();
  });
}

