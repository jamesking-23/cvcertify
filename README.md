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
2. Deploy `supabase/functions/cvc-api` (JWT verification on). Set the secret `GEMINI_API_KEY` (free key from Google AI Studio; optional `GEMINI_MODEL`, default `gemini-2.5-flash`). Without it, or when Gemini is busy, the built-in writer answers instead.
3. Put your project URL and publishable key in `public/js/config.js`.
4. In Supabase Auth settings, add the site URL (for example `https://<user>.github.io/cvcertify/`) to **Redirect URLs** so confirmation, reset and Google links return to the app.

## Deploy
Pushes to `main` publish `public/` to GitHub Pages (Settings > Pages > Source: GitHub Actions).

## Known limits
There are no paid plans: everything is free, with a fair-use cap of 200 AI actions per account per month (`cvc_plan_limits`). The old payment tables and the `cvc-pay`, `cvc-webhook` and `cvc-sms` functions are dormant and can be deleted from the Supabase dashboard. QR codes and custom portfolio domains are not built yet. See `ROADMAP.md`.


## Going live

**1. Secrets** (Supabase dashboard, Edge Functions, Secrets; never commit them):

| Secret | Used by | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `cvc-api` | Google Gemini key for AI writing. Free-tier content may be used by Google to improve its products (disclosed in the Privacy page). |
| `GEMINI_MODEL` | `cvc-api` | Optional. Defaults to `gemini-2.5-flash`. |

**2. Email confirmation:** to avoid depending on Supabase's limited email sending, turn off Authentication > Providers > Email > **Confirm email**. The app handles both settings.

**3. First admin:** sign up on the site, then run once in the Supabase SQL editor:

```sql
insert into public.cvc_admins (user_id) select id from auth.users where email = 'you@example.com';
```

The **Admin** link then appears in the app sidebar (visitors, users, activity).
