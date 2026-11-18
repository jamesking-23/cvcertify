// CV-Certify server-side tasks: AI writing, ATS scoring. Everything else is plain Postgres behind RLS.
// Plan gating and AI quotas are enforced here via service-role-only SQL functions, so clients cannot bypass them.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as ai from "./ai.mjs";
import { scoreResume } from "./ats.mjs";
import { cleanContent, cleanJob, text } from "./clean.mjs";
import { HttpError } from "./util.mjs";
import { COUNTRIES } from "./constants.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

// Best-effort per-instance throttle.
const hits = new Map<string, number[]>();
function throttle(key: string, limit = 40, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const rec = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (rec.length >= limit) throw new HttpError(429, "Too many requests. Please wait a few minutes and try again.", "rate_limited");
  rec.push(now);
  hits.set(key, rec);
}

const needJob = (j: unknown) => {
  const job = cleanJob(j);
  if (job.description.trim().length < 40) throw new HttpError(400, "Paste the job description first (at least a few sentences).", "need_job");
  return job;
};
const country = (c: unknown) => (typeof c === "string" && COUNTRIES[c as keyof typeof COUNTRIES] ? c : "US");

// deno-lint-ignore no-explicit-any
function rpcError(e: any): never {
  const hint = e?.hint || "";
  if (hint === "quota_exceeded" || hint === "upgrade_required") throw new HttpError(402, e.message, hint);
  if (hint === "no_account") throw new HttpError(409, "Finish setting up your account first (reload the page).", hint);
  throw new HttpError(500, "Something went wrong on our side. Please try again.", "server_error");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) throw new HttpError(401, "Please sign in to continue.", "unauthenticated");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let b: Record<string, unknown>;
    try {
      const raw = await req.text();
      if (raw.length > 400_000) throw new HttpError(413, "Request too large.");
      b = raw ? JSON.parse(raw) : {};
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(400, "Invalid JSON body.");
    }
    const task = String(b.task || "");
    throttle(user.id);

    const feature = async (f: string) => {
      const { error } = await admin.rpc("cvc_require_feature", { p_user: user.id, p_feature: f });
      if (error) rpcError(error);
    };
    const spend = async () => {
      const { data, error } = await admin.rpc("cvc_spend_rewrite", { p_user: user.id });
      if (error) rpcError(error);
      return data;
    };
    const metered = async <T>(fn: () => Promise<T>) => {
      const plan = await spend();
      try {
        return { ...(await fn()), plan };
      } catch (e) {
        await admin.rpc("cvc_refund_rewrite", { p_user: user.id }); // the AI call failed: give the quota back
        throw e;
      }
    };

    switch (task) {
      case "bullets":
        return reply(200, await metered(async () => {
          const bullets = (Array.isArray(b.bullets) ? b.bullets : []).slice(0, 12).map((x) => text(x, 500)).filter((x) => x.trim());
          if (!bullets.length) throw new HttpError(400, "Add at least one bullet point first.");
          return ai.rewriteBullets({ bullets, role: text(b.role, 160), company: text(b.company, 160), job: b.job ? cleanJob(b.job) : null });
        }));
      case "summary":
        return reply(200, await metered(() => ai.writeSummary({ content: cleanContent(b.content), job: b.job ? cleanJob(b.job) : null })));
      case "tailor":
        return reply(200, await metered(async () => {
          const job = needJob(b.job);
          const out = await ai.tailorResume({ content: cleanContent(b.content), job, country: country(b.country) });
          return { ...out, content: cleanContent(out.content) };
        }));
      case "letter": {
        await feature("letters");
        const tones = ["professional", "warm", "confident", "concise"];
        return reply(200, await metered(() => ai.writeCoverLetter({ content: cleanContent(b.content), job: needJob(b.job), tone: tones.includes(String(b.tone)) ? String(b.tone) : "professional", country: country(b.country) })));
      }
      case "ats":
        await feature("ats");
        return reply(200, scoreResume(cleanContent(b.content), needJob(b.job).description));
      case "interview":
        await feature("interview");
        return reply(200, await ai.interviewPrep({ content: cleanContent(b.content), job: needJob(b.job) }));
      case "roadmap": {
        await feature("roadmap");
        const content = cleanContent(b.content);
        const job = needJob(b.job);
        const { missing } = scoreResume(content, job.description);
        return reply(200, { missing, ...(await ai.skillRoadmap({ content, job, missing })) });
      }
      case "assistant": {
        const message = text(b.message, 2000).trim();
        if (!message) throw new HttpError(400, "Type a question first.");
        const { data } = await asUser.from("cvc_profiles").select("content").maybeSingle();
        return reply(200, await ai.assistant({ message, history: Array.isArray(b.history) ? b.history.slice(-8) : [], content: cleanContent(data?.content), context: b.context }));
      }
      case "config":
        return reply(200, { ai: ai.aiEnabled() });
      default:
        throw new HttpError(400, "Unknown task.", "bad_task");
    }
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message, code: e.code });
    console.error("Unhandled error:", e);
    return reply(500, { error: "Something went wrong on our side. Please try again.", code: "server_error" });
  }
});
