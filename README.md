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
2. Deploy `supabase/functions/cvc-api` (JWT verification on). It needs no AI key: all writing and the assistant run offline inside the function.
3. Put your project URL and publishable key in `public/js/config.js`.
4. In Supabase Auth settings, add the site URL (for example `https://<user>.github.io/cvcertify/`) to **Redirect URLs** so confirmation, reset and Google links return to the app.

## Deploy
Pushes to `main` publish `public/` to GitHub Pages (Settings > Pages > Source: GitHub Actions).

## Known limits
There are no paid plans and no usage cap: everything is free. The old payment tables and the `cvc-pay`, `cvc-webhook` and `cvc-sms` functions are dormant and can be deleted from the Supabase dashboard. QR codes and custom portfolio domains are not built yet. See `ROADMAP.md`.


## Going live

**1. Secrets:** none are needed for writing or the assistant. There is no AI provider, no API key and no outbound AI call.

**2. Email confirmation:** to avoid depending on Supabase's limited email sending, turn off Authentication > Providers > Email > **Confirm email**. The app handles both settings.

**3. First admin:** sign up on the site, then run once in the Supabase SQL editor:

```sql
insert into public.cvc_admins (user_id) select id from auth.users where email = 'you@example.com';
```

The **Admin** link then appears in the app sidebar (visitors, users, activity).

## The offline assistant
`supabase/functions/cvc-api/router.mjs` classifies a chat message; `actions.mjs` holds the deterministic functions it can run. The router never writes the answer.

- **`INTENTS`** maps each action to 5-8 example phrases (formal, casual, broken grammar, Ugandan and East African slang). Their vectors are computed once at start-up.
- A message is embedded the same way and compared by cosine similarity. The best intent wins if its confidence reaches the threshold (default `0.65`, override with the `ASSISTANT_MIN_CONFIDENCE` secret). Below it, the user gets a polite fallback that lists example commands.
- Inputs such as a job title, company, country or pasted job advert are pulled out with regular expressions and validated; if one is missing, the assistant says exactly what to send.
- To add a feature: add a function and an entry in `ACTIONS` (with a title and example) and 5-8 phrases in `INTENTS`. A test fails if the two lists disagree.
- The embedder is a hashed bag of words, word pairs and character n-grams with IDF weights: pure JavaScript, no model file, under 3 ms per message. To use a neural model instead, replace `embed()` and `buildIndex()` in `router.mjs`; nothing else depends on how vectors are made.
