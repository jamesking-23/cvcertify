# Roadmap

Progress is tracked here and in the commit history. Each push runs CI (Actions tab); the `app-screenshots`
artifact on every run shows the running app. Pushes to `main` that touch `public/` redeploy the site to GitHub Pages.

## Done
- [x] Marketing site: landing, templates, pricing
- [x] Accounts on Supabase Auth: sign up, sign in, password change/reset, data deletion
- [x] Master profile with autosave
- [x] Resume editor: live preview, 7 templates (incl. Academic, Timeline, Rail), 3 cover letter layouts, 8 country formats, Word export (in the browser), print to PDF
- [x] AI writing with offline fallback (Edge Function `cvc-api`): bullets, summary, tailoring, cover letters, interview prep, roadmap, assistant
- [x] ATS scanner (deterministic)
- [x] Verifiable document IDs, public verify page, edit detection, revocation
- [x] Plan limits and AI quotas enforced in the database / Edge Function, not the browser
- [x] Portfolio pages (Career+)
- [x] Row Level Security on every table, checked with SQL scenarios against the live project
- [x] GitHub Pages deployment, CI with unit tests and a browser smoke test

## Next
- [ ] Set `ANTHROPIC_API_KEY` as an Edge Function secret and test AI with a real key
- [ ] Confirm email sign-up settings (confirmation on/off) and the allowed redirect URL for the Pages site
- [ ] Enable leaked-password protection in Supabase Auth settings
- [ ] Payments (Stripe) and switching `cvc_settings.allow_self_serve_plan` to false
- [ ] Google sign-in (enable the provider in Supabase)
- [ ] QR codes on certified documents
- [ ] Custom domains for portfolios
- [ ] Live end-to-end test against Supabase with a dedicated test account
