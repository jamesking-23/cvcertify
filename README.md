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
2. Deploy `supabase/functions/cvc-api` (JWT verification on). Writing tools run offline. Only the assistant's Tier 3 needs the optional `GEMINI_API_KEY` secret (set it in the Supabase dashboard, never in code).
3. Put your project URL and publishable key in `public/js/config.js`.
4. In Supabase Auth settings, add the site URL (for example `https://<user>.github.io/cvcertify/`) to **Redirect URLs** so confirmation, reset and Google links return to the app.

## Deploy
Pushes to `main` publish `public/` to GitHub Pages (Settings > Pages > Source: GitHub Actions).

## Known limits
There are no paid plans and no usage cap: everything is free. The old payment tables and the `cvc-pay`, `cvc-webhook` and `cvc-sms` functions are dormant and can be deleted from the Supabase dashboard. QR codes and custom portfolio domains are not built yet. See `ROADMAP.md`.


## Going live

**1. Secrets:** `GEMINI_API_KEY` (Supabase dashboard > Edge Functions > Secrets) switches on Tier 3 of the assistant. Without it the assistant still answers all built-in commands and says politely that the AI service is off for open questions.

**2. Email confirmation:** to avoid depending on Supabase's limited email sending, turn off Authentication > Providers > Email > **Confirm email**. The app handles both settings.

**3. First admin:** sign up on the site, then run once in the Supabase SQL editor:

```sql
insert into public.cvc_admins (user_id) select id from auth.users where email = 'you@example.com';
```

The **Admin** link then appears in the app sidebar (visitors, users, activity).

## Portfolio designs
A page's look is three independent choices plus light/dark: 10 layouts (Atelier, Rail, Monolith, Bento, Timeline, Magazine, Terminal, Spotlight, Swiss, Classic), 14 colour palettes and 12 typefaces, so 3,360 looks. `public/js/portfolio-designs.js` holds the data; `public/css/portfolio.css` the layouts. Pages with no saved choice get a stable look derived from their web address, so two people rarely look alike. Every palette is contrast-tested in both modes (`tests/designs.test.mjs`). To add a layout: add it to `DESIGNS` and write its `.pf[data-design="id"]` block.

## The assistant: three tiers
1. **Tier 1, on your device (offline).** `public/js/assistant/` loads the quantized `Xenova/bge-small-en-v1.5` model (~33 MB) with Transformers.js from local files only (`allowRemoteModels = false`). `npm run model` downloads the model and runtime into `public/models` and `public/vendor` and precomputes the intent vectors; the Pages workflow runs it on every build. A message is embedded and compared (cosine >= 0.72) with the `INTENTS` bank in `router.mjs`; the winning intent runs a typed function in `actions.mjs` (greetings, help, calculator, CV tools). Until the model has loaded, or if it fails, a built-in hashed n-gram embedder keeps Tier 1 working.
2. **Tier 2, shared semantic cache.** On a Tier 1 miss the browser sends its bge embedding to the `ask` task. The function looks it up in `cvc_response_cache` (pgvector) and returns a stored answer when cosine >= 0.90, the extracted conditions (country) match, and the source facts are unchanged. Questions containing numbers or about the person's own data are never cached. Hits update `last_used_at`.
3. **Tier 3, Gemini.** Only if Tiers 1 and 2 miss: retrieve app facts (`knowledge.mjs`), call Gemini (`gemini.mjs`), save the answer with its embedding and `source_fact_ids` to the cache, return it. With no internet or no key the user gets a friendly message.

Cache upkeep (`cache.mjs`): LRU cap of 10,000 rows (`pruneCache`, also enforced on every insert) and `invalidateCacheByFact(admin, factId)` to drop answers built from a fact you changed. Editing a fact's text also invalidates them automatically through its version hash.

To add a command: add a function and an entry in `ACTIONS`, plus 5-8 phrases in `INTENTS`; a test fails if the two disagree. After editing shared files run `npm run sync`.
