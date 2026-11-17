# Roadmap

Progress is tracked here and in the commit history. Each push runs CI (see the Actions tab); the
`app-screenshots` artifact on every run shows what the running app looks like.

## Done
- [x] Marketing site: landing, templates, pricing
- [x] Accounts: sign up, sign in, sessions, password change, account deletion
- [x] Master profile with autosave
- [x] Resume editor: live preview, 4 templates, 8 country formats, Word export, print to PDF
- [x] AI writing with offline fallback: bullets, summary, tailoring, cover letters, interview prep, roadmap, assistant
- [x] ATS scanner (deterministic)
- [x] Verifiable document IDs, public verify page, edit detection, revocation
- [x] Plan limits enforced on the server
- [x] Portfolio pages (Career+)
- [x] Unit/API tests and browser end-to-end test

## Next
- [ ] Deploy to Netlify and smoke-test the Postgres (Netlify DB) storage path
- [ ] Test AI features with a real Anthropic API key
- [ ] Payments (Stripe) and locking self-serve plan changes
- [ ] QR codes on certified documents
- [ ] Google sign-in and password-reset email configured and tested
- [ ] Custom domains for portfolios
- [ ] Match any features of the original site that were not visible in the screenshots
