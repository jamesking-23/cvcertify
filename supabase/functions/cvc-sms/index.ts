// Receives the MTN / Airtel "money received" SMS forwarded by the owner's phone and lets the database confirm
// matching payments. Not JWT protected (a phone app calls it); authenticated by a shared key instead.
//
// Secret: SMS_WEBHOOK_KEY  (a long random string; send it as the x-webhook-key header, or as ?key=... in the URL)
//
// Accepts JSON, form data or plain text. Recognised fields: message / text / body / content / sms, and from / sender / address.
// Only messages that look like mobile money confirmations are kept, so private SMS that a forwarder sends by mistake are ignored.
import { createClient } from "npm:@supabase/supabase-js@2";

const out = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) { const v = o[k]; if (typeof v === "string" && v.trim()) return v; }
  return "";
};
const LOOKS_LIKE_MONEY = /(UGX|USH|UGANDA SHILLING|TRANSACTION|TRANS\s*ID|TXN|TID)/i;

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "Use POST." }, 405);
  const key = Deno.env.get("SMS_WEBHOOK_KEY") ?? "";
  if (!key) return out({ error: "Not configured." }, 503);
  const given = req.headers.get("x-webhook-key") ?? new URL(req.url).searchParams.get("key") ?? "";
  if (!same(given, key)) return out({ error: "Bad key." }, 401);

  let data: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  const raw = (await req.text()).slice(0, 5000);
  try {
    if (type.includes("json")) data = JSON.parse(raw);
    else if (type.includes("x-www-form-urlencoded")) data = Object.fromEntries(new URLSearchParams(raw));
    else { try { data = JSON.parse(raw); } catch { data = { message: raw }; } }
  } catch { return out({ error: "Unreadable body." }, 400); }

  const body = pick(data, ["message", "text", "body", "content", "sms", "msg"]);
  const sender = pick(data, ["from", "sender", "address", "number"]);
  if (!body) return out({ ignored: "empty" });
  if (!LOOKS_LIKE_MONEY.test(body)) return out({ ignored: "not a payment message" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: res, error } = await admin.rpc("cvc_process_sms", { p_sender: sender, p_body: body });
  if (error) { console.error("process_sms", error.message); return out({ error: "Could not record." }, 500); }
  return out(res);
});
