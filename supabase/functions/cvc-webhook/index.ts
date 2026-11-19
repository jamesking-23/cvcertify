// Flutterwave webhook: confirms payments even if the customer closes the tab before returning to the site.
// Not JWT protected (Flutterwave has no Supabase login). Authenticated by the shared secret hash header instead,
// and the payload is never trusted: the transaction is looked up again with Flutterwave before anything changes.
//
// Secrets: FLW_SECRET_KEY, FLW_SECRET_HASH (the "Secret hash" you set in Flutterwave > Settings > Webhooks).
import { createClient } from "npm:@supabase/supabase-js@2";

const ok = (b: unknown = { ok: true }, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "Use POST." }, 405);
  const hash = Deno.env.get("FLW_SECRET_HASH") ?? "", secret = Deno.env.get("FLW_SECRET_KEY") ?? "";
  if (!hash || !secret) return ok({ error: "Not configured." }, 503);
  if (!same(req.headers.get("verif-hash") ?? "", hash)) return ok({ error: "Bad signature." }, 401);
  const body = await req.json().catch(() => null);
  const txRef = String(body?.data?.tx_ref ?? body?.txRef ?? "");
  if (!/^cvc_[a-f0-9]{32}$/.test(txRef)) return ok({ ignored: true });   // other apps sharing this Flutterwave account

  const res = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`, { headers: { Authorization: `Bearer ${secret}` } });
  const t = (await res.json().catch(() => ({})))?.data;
  if (!res.ok || !t) return ok({ error: "Could not verify." }, 502);   // Flutterwave retries on non-200
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.rpc("cvc_complete_payment", { p_tx_ref: txRef, p_provider_ref: String(t.id ?? ""), p_amount: Number(t.amount) || 0, p_currency: String(t.currency || ""), p_status: String(t.status || ""), p_method: String(t.payment_type || "") });
  if (error) { console.error("complete_payment", error.message); return ok({ error: "Could not record." }, 500); }
  return ok();
});
