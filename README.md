# CV-Certify

**A job for everyone.** One profile, every career document: AI-tailored resumes and cover letters, an ATS scanner, interview prep, country-aware formats, and **verifiable document IDs** recruiters can check without an account.

Rebuilt from the original Netlify site with a cleaner UI/UX and working end-to-end features.

## Features

| Area | What works |
|---|---|
| Accounts | Email + password (scrypt hashing, signed HttpOnly cookie sessions, login throttling), Google sign-in (optional), password reset by email (optional), account deletion |
| Master profile | Personal details, summary, experience, education, skills, projects, certifications, languages, referees. Autosaves. |
| Resumes | Create many from your profile, live preview, 4 ATS-safe templates, 8 country formats (paper size, date of birth / nationality / referees rules), Word (.docx) export, PDF via print |
| AI writing | Rewrite bullets, write summary, tailor a resume to a job, cover letters, interview questions, skill roadmap, chat assistant. Uses Claude when `ANTHROPIC_API_KEY` is set; otherwise falls back to a rule-based **basic mode** (never invents facts). |
| ATS scanner | Deterministic keyword + quality scoring against a pasted job description. No AI needed. |
| Verification | "Certify" a resume to get an ID like `CVC-8M2F-3ZG9-64H8` and a public page at `/verify/<id>`. Detects edits after certification, supports revoking. Public page shows only what the holder certified (no email/phone). |
| Plans | Starter / Professional / Career+ with real limits enforced on the server (resume count, AI rewrite quota, feature gates) |
| Portfolio (Career+) | Public page at `/p/<slug>` built from a resume |

## Run locally

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY etc.
npm run dev               # http://localhost:3000
```

With no configuration it runs in **basic mode** and stores data in `.data/db.json` (local development only).

```bash
npm test                  # backend unit + API integration tests
npm run test:e2e          # full browser journey (needs Playwright + Chromium)
```

## Deploy on Netlify

1. Connect the repo. `netlify.toml` already sets `publish = "public"` and `functions = "netlify/functions"`. There is no build step.
2. Set environment variables (see `.env.example`). **`SESSION_SECRET` is required** in production.
3. Enable **Netlify DB** (sets `NETLIFY_DATABASE_URL`). The app creates its one table on first request.
4. Optional: `ANTHROPIC_API_KEY` (AI), `GOOGLE_CLIENT_ID` (Google sign-in), `RESEND_API_KEY` + `MAIL_FROM` (password reset), `SITE_URL`.

## Architecture

```
public/            static SPA (vanilla ES modules, no build step)
  js/pages/        one module per screen, lazy-loaded by the router
  js/shared/       constants shared with the server (plans, countries, templates)
netlify/functions/api.mjs   single Netlify Function for /api/*
netlify/lib/       router + handlers, auth, db, AI, ATS scoring, DOCX export
dev-server.mjs     local server using the same handler as Netlify
tests/             unit/API tests + Playwright E2E
```

## Honest limitations

- **Payments are not integrated.** With `ALLOW_SELF_SERVE_PLAN_CHANGE=true` (default) anyone can switch plans for free, which is for demo only. Set it to `false` until Stripe (or similar) is wired in.
- **Postgres storage has not been tested against a real database.** The local file backend is fully tested; the Netlify DB backend (`netlify/lib/db.mjs`) is written to Neon's SQL-over-HTTP API and must be smoke-tested on a real deploy before launch. The Netlify Function wrapper has likewise not been run on Netlify itself.
- **AI paths with a real API key are untested** (no key was available). Basic mode is tested.
- **No QR codes yet.** Verification works by ID and link.
- **No custom domains for portfolios**, and no LinkedIn sign-in.
- Rate limiting is per server instance (best effort), not global.
- A verified ID proves a document was issued from an account and not altered since. It does **not** verify employers or qualifications, and the public page says so.
