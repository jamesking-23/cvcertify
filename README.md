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
