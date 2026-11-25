// Keeps the Edge Function's copies of shared modules identical to the browser's.
// constants.js: canonical = public/js/shared. clean.mjs + util.mjs: canonical = supabase/functions/cvc-api.
import { copyFileSync, readFileSync } from 'node:fs';
const FN = 'supabase/functions/cvc-api', PUB = 'public/js/shared';
// router, actions, tier1, offline, profile, ats: canonical = supabase/functions/cvc-api; the browser runs Tier 1 from these copies.
const BROWSER = ['router.mjs', 'actions.mjs', 'tier1.mjs', 'offline.mjs', 'profile.mjs', 'ats.mjs'];
const pairs = [[`${PUB}/constants.js`, `${FN}/constants.js`], [`${FN}/clean.mjs`, `${PUB}/clean.mjs`], [`${FN}/util.mjs`, `${PUB}/util.mjs`], ...BROWSER.map((f) => [`${FN}/${f}`, `${PUB}/${f}`])];
const check = process.argv.includes('--check');
let bad = 0;
for (const [from, to] of pairs) {
  if (check) { if (readFileSync(from, 'utf8') !== readFileSync(to, 'utf8')) { console.error(`out of sync: ${from} -> ${to}`); bad++; } }
  else copyFileSync(from, to);
}
process.exit(bad ? 1 : 0);
