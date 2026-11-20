# CV-Certify

Build one master profile, generate recruiter-ready, ATS-friendly resumes and cover letters for any country,
and give every finished resume a verifiable document ID that recruiters can check without an account.

- **Front end:** static single-page app in `public/` (no build step, no framework), hosted on GitHub Pages with hash routing (`#/app/...`).
- **Back end:** Supabase. Data lives in `cvc_*` tables protected by Row Level Security. Business rules (plan limits, certification, public verification) are SQL functions. AI writing and ATS scoring run in the `cvc-api` Edge Function.
- **Shared project:** this app shares a Supabase project (and its login accounts) with another app; every object here is prefixed `cvc_`, and "delete my data" removes only CV-Certify data.

## Layout
| Path | What it is |
| --- | --- |
| `public/` | The site. `js/backend.js` maps page calls to Supabase; `js/supabase-lite.js` is a tiny dependency-free client. |
| `supabase/migrations/` | Database schema, RLS, triggers and RPCs. |
| `supabase/functions/cvc-api/` | Edge Function: AI tasks and ATS scoring, with plan gating and quotas. |
| `scripts/` | Dev server and the sync check that keeps shared modules identical in browser and function. |
| `tests/` | Unit tests and a browser smoke test (Supabase is faked in the test). |

## Run locally
```
npm install
npm run dev        # http://localhost:3000, talks to the real Supabase project
npm test           # unit tests
npm run test:e2e   # browser smoke test (needs: npx playwright install chromium)
```
After editing `public/js/shared/constants.js` or the function's `clean.mjs` / `util.mjs`, run `npm run sync`.

## Set up your own Supabase project
1. Apply `supabase/migrations/*.sql`.
2. Deploy `supabase/functions/cvc-api` (JWT verification on). Optionally set the secret `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL`); without it the AI features run in basic mode.
3. Put your project URL and publishable key in `public/js/config.js`.
4. In Supabase Auth settings, add the site URL (for example `https://<user>.github.io/cvcertify/`) to **Redirect URLs** so confirmation, reset and Google links return to the app.

## Deploy
Pushes to `main` publish `public/` to GitHub Pages (Settings > Pages > Source: GitHub Actions).

## Known limits
Payments are not connected: plan changes are free self-serve while `cvc_settings.allow_self_serve_plan` is true. QR codes and custom portfolio domains are not built yet. See `ROADMAP.md`.


## Going live: payments, redeem codes and the admin console

**1. Secrets** (Supabase dashboard, Edge Functions, Secrets; never commit them):

| Secret | Used by | Purpose |
|---|---|---|
| `FLW_SECRET_KEY` | `cvc-pay`, `cvc-webhook` | Flutterwave secret key. Without it checkout is switched off and only redeem codes work. |
| `FLW_SECRET_HASH` | `cvc-webhook` | The "secret hash" you type into Flutterwave's webhook settings. |
| `ANTHROPIC_API_KEY` | `cvc-api` | Real generative writing. Without it the built-in profile-aware writer is used. |
| `ALLOWED_ORIGINS` | `cvc-pay` | Optional. Sites allowed to receive customers after payment. Defaults to the GitHub Pages site and localhost. |

**2. Flutterwave webhook URL:** `https://dgvaoswcbzzcyaentjwr.supabase.co/functions/v1/cvc-webhook`

**3. First admin:** sign up on the site, then run once in the Supabase SQL editor:

```sql
insert into public.cvc_admins (user_id) select id from auth.users where email = 'you@example.com';
```

The **Admin** link then appears in the app sidebar. Plans are granted by payment, redeem code or admin only (`allow_self_serve_plan` is off).

Prices live in `cvc_plan_price()` in the database; the browser only displays them. Paid access lasts 30 days per month bought and does not renew by itself.


## Automatic confirmation of manual mobile money (SMS forwarding)

Customers pay your MTN/Airtel number and enter the transaction ID. Your phone forwards the "money received" SMS to the `cvc-sms` Edge Function, and the database confirms the payment when the **transaction ID and the exact amount** match. It works in either order (SMS first or customer first).

1. Secret `SMS_WEBHOOK_KEY` = a long random string (Supabase, Edge Functions, Secrets).
2. On the Android phone that holds the SIMs, install an SMS-to-webhook forwarder app (any app that can POST incoming SMS to a URL).
   - URL: `https://dgvaoswcbzzcyaentjwr.supabase.co/functions/v1/cvc-sms?key=YOUR_SMS_WEBHOOK_KEY`
   - Method POST, body JSON like `{"from": "{{sender}}", "message": "{{message}}"}` (use the app's placeholders).
   - Only forward messages from MTN / Airtel mobile money senders. Messages that do not look like payment confirmations are ignored anyway.
3. Send yourself a small payment and check Admin > Payments: "Last message from your phone" should update.
4. Press **Turn on** under "Automatic confirmation". Until then, matching payments show a "Seen on your phone" badge so approval is one click.

Safety: SMS can in theory be faked, so at most 50 payments a day are auto-confirmed, every one is listed in the Activity log with the SMS it used, and each SMS can only confirm one payment.
