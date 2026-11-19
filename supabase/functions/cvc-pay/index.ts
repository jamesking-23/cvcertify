// Starts and confirms Flutterwave payments (cards, MTN and Airtel mobile money in UGX).
// The amount is computed in the database from the plan, never taken from the browser, and a payment only
// upgrades an account after the provider confirms it server-side (amount and currency are checked in SQL).
//
// Secrets (set in Supabase > Edge Functions > Secrets, never in code):
//   FLW_SECRET_KEY   Flutterwave secret key
//   ALLOWED_ORIGINS  optional, comma separated. Default: https://jamesking-23.github.io,http://localhost:3000
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
class Fail extends Error { constructor(public status: number, m: string, public code = "error") { super(m); } }

const FLW = "https://api.flutterwave.com/v3";
const key = () => Deno.env.get("FLW_SECRET_KEY") ?? "";
const origins = () => (Deno.env.get("ALLOWED_ORIGINS") ?? "https://jamesking-23.github.io,http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean);

async function flw(path: string, init?: RequestInit) {
  const res = await fetch(FLW + path, { ...init, headers: { Authorization: `Bearer ${key()}`, "content-type": "application/json", ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.error("Flutterwave", res.status, JSON.stringify(data).slice(0, 300)); throw new Fail(502, "The payment provider could not be reached. Please try again.", "provider_error"); }
  return data;
}

const hits = new Map<string, number[]>();
function throttle(k: string) {
  const now = Date.now();
  const rec = (hits.get(k) || []).filter((t) => now - t < 600_000);
  if (rec.length >= 12) throw new Fail(429, "Too many attempts. Please wait a few minutes.", "rate_limited");
  rec.push(now); hits.set(k, rec);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method !== "POST") throw new Fail(405, "Use POST.");
    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) throw new Fail(401, "Please sign in to continue.", "unauthenticated");
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json().catch(() => ({}));
    const task = String(b.task || "");

    if (task === "config") return reply(200, { enabled: !!key() });
    if (!key()) throw new Fail(503, "Online payments are not switched on yet. If you have a redeem code, you can use it on the Account page.", "payments_off");
    throttle(user.id);

    if (task === "checkout") {
      const plan = String(b.plan), months = Number(b.months) || 1;
      const ret = String(b.returnUrl || "");
      let base: URL;
      try { base = new URL(ret); } catch { throw new Fail(400, "Bad return address."); }
      if (!origins().includes(base.origin)) throw new Fail(400, "That return address is not allowed.");
      base.search = ""; base.hash = "";
      const txRef = `cvc_${crypto.randomUUID().replace(/-/g, "")}`;
      const { data, error } = await admin.rpc("cvc_start_payment", { p_user: user.id, p_plan: plan, p_months: months, p_tx_ref: txRef });
      if (error) throw new Fail(error.hint === "higher_plan" ? 409 : 400, error.message, error.hint || "error");
      const out = await flw("/payments", {
        method: "POST",
        body: JSON.stringify({
          tx_ref: txRef, amount: data.amount, currency: data.currency, redirect_url: base.toString() + "?cvcpay=1",
          payment_options: "card,mobilemoneyuganda",
          customer: { email: data.email, name: data.name || data.email },
          customizations: { title: "CV-Certify", description: `${plan === "career" ? "Career+" : "Professional"} for ${months} month${months > 1 ? "s" : ""}` },
        }),
      });
      if (!out?.data?.link) throw new Fail(502, "The payment provider did not return a checkout link. Please try again.", "provider_error");
      return reply(200, { link: out.data.link, txRef, amount: data.amount, currency: data.currency });
    }

    if (task === "verify") {
      const txRef = String(b.txRef || "");
      if (!/^cvc_[a-f0-9]{32}$/.test(txRef)) throw new Fail(400, "Bad payment reference.");
      const { data: owner } = await admin.rpc("cvc_payment_owner", { p_tx_ref: txRef });
      if (owner !== user.id) throw new Fail(404, "Payment not found.", "unknown_payment");
      const v = await flw(`/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
      const t = v?.data;
      if (!t) return reply(200, { status: "pending" });
      const { data, error } = await admin.rpc("cvc_complete_payment", { p_tx_ref: txRef, p_provider_ref: String(t.id ?? ""), p_amount: Number(t.amount) || 0, p_currency: String(t.currency || ""), p_status: String(t.status || ""), p_method: String(t.payment_type || "") });
      if (error) throw new Fail(400, error.message, error.hint || "error");
      return reply(200, data);
    }
    throw new Fail(400, "Unknown task.", "bad_task");
  } catch (e) {
    if (e instanceof Fail) return reply(e.status, { error: e.message, code: e.code });
    console.error("Unhandled", e);
    return reply(500, { error: "Something went wrong on our side. Please try again.", code: "server_error" });
  }
});
