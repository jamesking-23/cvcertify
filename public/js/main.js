import { h, icon, clear, toast, setTitle } from './ui.js';
import { get, post, ApiError } from './api.js';
import { auth, rpc } from './supabase-lite.js';
import { PLANS } from './shared/constants.js';

const BUILD = document.querySelector('meta[name="cvc-build"]')?.content || 'dev';
export const state = { user: null, config: {} };
const root = document.getElementById('root');
let leaveHooks = [];

export const onLeave = (fn) => leaveHooks.push(fn);
export const setUser = (u) => {
  state.user = u;
};

/* ---------- navigation ---------- */
// Hash routing keeps the app working on static hosting (GitHub Pages) at any sub-path.
// Location looks like  #/app/account?x=1#plans  (path, optional query, optional in-page anchor).
export function here() {
  const [beforeAnchor, anchor = ''] = location.hash.slice(1).split('#');
  const [p, search = ''] = beforeAnchor.split('?');
  const path = ('/' + p.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  return { path, search: search ? '?' + search : '', anchor };
}

export function navigate(to, { replace = false } = {}) {
  const target = '#' + to;
  if (target === location.hash) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', location.pathname + location.search + target);
  return render();
}

window.addEventListener('popstate', render);
window.addEventListener('cv:signed-out', () => {
  if (state.user) {
    state.user = null;
    toast('Your session expired. Please sign in again.', 'error');
    navigate('/login?next=' + encodeURIComponent(here().path), { replace: true });
  }
});

/* ---------- routes ---------- */
const lazy = (path, fn = 'default') => async (ctx) => (await import(path))[fn](ctx);

const routes = [
  { re: /^\/$/, public: true, load: lazy('./pages/landing.js', 'landing'), title: '' },
  { re: /^\/templates$/, public: true, load: lazy('./pages/marketing.js', 'templatesPage'), title: 'Templates' },
  { re: /^\/pricing$/, public: true, load: lazy('./pages/landing.js', 'landing'), title: 'Pricing', scroll: 'pricing' },
  { re: /^\/features$/, public: true, load: lazy('./pages/landing.js', 'landing'), title: 'Features', scroll: 'features' },
  { re: /^\/login$/, public: true, guestOnly: true, load: lazy('./pages/auth.js', 'loginPage'), title: 'Sign in' },
  { re: /^\/signup$/, public: true, guestOnly: true, load: lazy('./pages/auth.js', 'signupPage'), title: 'Create account' },
  { re: /^\/forgot$/, public: true, guestOnly: true, load: lazy('./pages/auth.js', 'forgotPage'), title: 'Reset password' },
  { re: /^\/reset$/, public: true, load: lazy('./pages/auth.js', 'resetPage'), title: 'Choose a new password' },
  { re: /^\/verify(?:\/([^/]+))?$/, public: true, load: lazy('./pages/verify.js'), title: 'Verify a document', params: ['id'] },
  { re: /^\/p\/([^/]+)$/, public: true, bare: true, load: lazy('./pages/portfolio-public.js'), title: 'Portfolio', params: ['slug'] },
  { re: /^\/app$/, app: 'home', load: lazy('./pages/dashboard.js'), title: 'Dashboard' },
  { re: /^\/app\/profile$/, app: 'profile', load: lazy('./pages/profile.js'), title: 'Master profile' },
  { re: /^\/app\/resumes$/, app: 'resumes', load: lazy('./pages/resumes.js', 'list'), title: 'Resumes' },
  { re: /^\/app\/resumes\/([^/]+)$/, app: 'resumes', load: lazy('./pages/resumes.js', 'editor'), title: 'Edit resume', params: ['id'], wide: true },
  { re: /^\/app\/letters$/, app: 'letters', load: lazy('./pages/letters.js'), title: 'Cover letters' },
  { re: /^\/app\/ats$/, app: 'ats', load: lazy('./pages/tools.js', 'atsPage'), title: 'ATS scanner' },
  { re: /^\/app\/interview$/, app: 'interview', load: lazy('./pages/tools.js', 'interviewPage'), title: 'Interview prep' },
  { re: /^\/app\/roadmap$/, app: 'roadmap', load: lazy('./pages/tools.js', 'roadmapPage'), title: 'Skill roadmap' },
  { re: /^\/app\/assistant$/, app: 'assistant', load: lazy('./pages/assistant.js'), title: 'AI assistant' },
  { re: /^\/app\/portfolio$/, app: 'portfolio', load: lazy('./pages/portfolio.js'), title: 'Portfolio' },
  { re: /^\/app\/admin$/, app: 'admin', load: lazy('./pages/admin.js'), title: 'Admin' },
  { re: /^\/app\/account$/, app: 'account', load: lazy('./pages/account.js'), title: 'Account & plan' },
];

/* ---------- shells ---------- */
export function logo(href = '/') {
  return h('a', { href, class: 'brand', 'aria-label': 'CV-Certify home' }, icon('shield'), 'CV-Certify');
}

function marketingShell(content) {
  const cur = here().path;
  const link = (href, label) => h('a', { href, 'aria-current': cur === href.split('#')[0] && href !== '/' ? 'page' : null }, label);
  const menu = h('div', { class: 'mobile-menu', id: 'mobile-menu' },
    h('a', { href: '/features' }, 'Features'), h('a', { href: '/templates' }, 'Templates'), h('a', { href: '/pricing' }, 'Pricing'), h('a', { href: '/verify' }, 'Verify a document'),
    state.user ? h('a', { href: '/app' }, 'Open dashboard') : [h('a', { href: '/login' }, 'Sign in'), h('a', { href: '/signup' }, 'Get started')]);
  const btn = h('button', { class: 'menu-btn', 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-controls': 'mobile-menu', onclick: () => { const o = menu.classList.toggle('open'); btn.setAttribute('aria-expanded', o); } }, icon('menu'));
  return h('div', null,
    h('header', { class: 'site-header' },
      h('div', { class: 'container inner' }, logo(), h('nav', { class: 'nav', 'aria-label': 'Main' }, link('/features', 'Features'), link('/templates', 'Templates'), link('/pricing', 'Pricing')),
        h('div', { class: 'header-actions' },
          state.user ? h('a', { href: '/app', class: 'btn btn-primary btn-sm' }, 'Dashboard') : [h('a', { href: '/login', class: 'link' }, 'Sign in'), h('a', { href: '/signup', class: 'btn btn-primary btn-sm' }, 'Get started')],
          btn)),
      menu),
    h('main', { id: 'main' }, content),
    h('footer', { class: 'site-footer' }, h('div', { class: 'container' },
      h('div', { class: 'footer-links' }, h('a', { href: '/features' }, 'Features'), h('a', { href: '/templates' }, 'Templates'), h('a', { href: '/pricing' }, 'Pricing'), h('a', { href: '/verify' }, 'Verify a document')),
      h('div', { class: 'brand', style: 'justify-content:center;margin-bottom:8px' }, icon('shield'), 'CV-Certify'),
      h('p', null, `© ${new Date().getFullYear()} CV-Certify. A job for everyone.`, BUILD !== 'dev' && h('span', { class: 'build', title: 'Site version. Use it to check you are not seeing a cached copy.' }, ` · v${BUILD}`))),
    h('div', { class: 'footer-mark', 'aria-hidden': 'true' }, 'CV-CERTIFY')));
}

const NAV = [
  ['home', '/app', 'home', 'Dashboard'],
  ['profile', '/app/profile', 'user', 'Master profile'],
  ['resumes', '/app/resumes', 'file', 'Resumes'],
  ['letters', '/app/letters', 'mail', 'Cover letters', 'letters'],
  ['ats', '/app/ats', 'scan', 'ATS scanner', 'ats'],
  ['interview', '/app/interview', 'chat', 'Interview prep', 'interview'],
  ['roadmap', '/app/roadmap', 'route', 'Skill roadmap', 'roadmap'],
  ['assistant', '/app/assistant', 'sparkles', 'AI assistant'],
  ['portfolio', '/app/portfolio', 'globe', 'Portfolio', 'portfolio'],
];

function appShell(content, active) {
  const u = state.user;
  const limits = u.plan.limits;
  const side = h('aside', { class: 'sidebar', 'aria-label': 'App navigation' },
    logo('/app'),
    NAV.map(([id, href, ic, label, feat]) => h('a', { href, class: 'side-link', 'aria-current': active === id ? 'page' : null, onclick: () => side.classList.remove('open') || scrim.remove() }, icon(ic), label, feat && !limits[feat] && icon('lock', 'lock'))),
    h('div', { class: 'side-spacer' }),
    h('a', { href: '/verify', class: 'side-link' }, icon('qr'), 'Verify a document'),
    u.isAdmin && h('a', { href: '/app/admin', class: 'side-link', 'aria-current': active === 'admin' ? 'page' : null }, icon('shield'), 'Admin'),
    h('a', { href: '/app/account', class: 'side-link', 'aria-current': active === 'account' ? 'page' : null }, icon('settings'), 'Account & plan'),
    h('div', { class: 'plan-box' },
      h('div', { class: 'row spread' }, h('strong', null, u.plan.name), h('a', { href: '/app/account#plans', class: 'eyebrow small' }, u.plan.id === 'career' ? 'Manage' : 'Upgrade')),
      limits.rewrites != null && [h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (u.plan.usage.rewrites / limits.rewrites) * 100)}%` })), h('div', { class: 'muted' }, `${u.plan.usage.rewrites} / ${limits.rewrites} AI rewrites this month`)],
      limits.rewrites == null && h('div', { class: 'muted', style: 'margin-top:4px' }, 'Unlimited AI tailoring')),
    h('button', { class: 'side-link', onclick: signOut }, icon('logout'), 'Sign out'));
  const scrim = h('div', { class: 'scrim', onclick: () => { side.classList.remove('open'); scrim.remove(); } });
  const top = h('div', { class: 'topbar' }, logo('/app'), h('button', { class: 'icon-btn', 'aria-label': 'Open menu', onclick: () => { side.classList.add('open'); document.body.append(scrim); } }, icon('menu')));
  return h('div', { class: 'app' }, side, h('div', { class: 'main' }, top, h('main', { id: 'main', class: 'page' }, content)));
}

export async function signOut() {
  try { await post('/auth/logout'); } catch { /* ignore */ }
  state.user = null;
  navigate('/', { replace: true });
}

export async function refreshUser() {
  const { user } = await get('/me');
  state.user = user;
  return user;
}

/* ---------- visit counting ---------- */
// Anonymous and light: a random id kept in this browser, the page, and the referring site's name. No cookies, no IP.
const visitorId = (() => {
  try {
    let v = localStorage.getItem('cvc_vid');
    if (!v) { v = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()).replace(/-/g, ''); localStorage.setItem('cvc_vid', v); }
    return v;
  } catch { return null; }
})();
const tidyPath = (p) => p.replace(/^\/app\/resumes\/[^/]+$/, '/app/resumes/:id').replace(/^\/verify\/[^/]+$/, '/verify/:id').replace(/^\/p\/[^/]+$/, '/p/:slug');
function track(path) {
  if (!visitorId || navigator.doNotTrack === '1' || path === '/app/admin') return;
  let ref = '';
  try {
    if (!sessionStorage.getItem('cvc_ref_sent')) {
      sessionStorage.setItem('cvc_ref_sent', '1');
      if (document.referrer) { const u = new URL(document.referrer); if (u.origin !== location.origin) ref = u.hostname.replace(/^www\./, ''); }
    }
  } catch { /* ignore */ }
  rpc('cvc_track', { p_visitor: visitorId, p_kind: 'view', p_path: tidyPath(path), p_ref: ref }, { anon: true }).catch(() => {});
}

/* ---------- render loop ---------- */
let renderId = 0;
async function render() {
  const id = ++renderId;
  for (const fn of leaveHooks.splice(0)) { try { await fn(); } catch { /* ignore */ } }
  document.body.classList.remove('lp-body');
  const { path, search, anchor } = here();
  const route = routes.find((r) => r.re.test(path));
  if (!route) {
    setTitle('Page not found');
    clear(root).append(marketingShell(h('div', { class: 'container section center' }, h('h1', null, 'Page not found'), h('p', { class: 'muted', style: 'margin:12px 0 24px' }, 'That page does not exist or has moved.'), h('a', { class: 'btn btn-primary', href: '/' }, 'Back to home'))));
    return;
  }
  if (route.app && !state.user) return navigate('/login?next=' + encodeURIComponent(path + search), { replace: true });
  if (route.guestOnly && state.user) return navigate('/app', { replace: true });

  const m = route.re.exec(path);
  const params = Object.fromEntries((route.params || []).map((k, i) => [k, m[i + 1] ? decodeURIComponent(m[i + 1]) : null]));
  setTitle(route.title);
  clear(root).append(h('div', { style: 'min-height:60vh;display:grid;place-items:center' }, h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' })));
  try {
    const node = await route.load({ params, user: state.user, navigate, config: state.config, query: new URLSearchParams(search) });
    if (id !== renderId) return; // a newer navigation won
    track(path);
    const shell = route.bare ? node : route.app ? appShell(node, route.app) : marketingShell(node);
    clear(root).append(shell);
    const target = route.scroll || new URLSearchParams(search).get('s') || anchor;
    if (target) document.getElementById(target)?.scrollIntoView();
    else window.scrollTo(0, 0);
    document.getElementById('main')?.focus?.({ preventScroll: true });
  } catch (e) {
    if (id !== renderId) return;
    console.error(e);
    if (e instanceof ApiError && e.status === 404) {
      clear(root).append(route.app ? appShell(h('div', { class: 'empty' }, h('h3', null, 'Not found'), h('p', null, e.message), h('a', { class: 'btn btn-primary', style: 'margin-top:16px', href: '/app' }, 'Back to dashboard')), route.app) : marketingShell(h('div', { class: 'container section center' }, h('h1', null, 'Not found'), h('p', { class: 'muted', style: 'margin:12px 0' }, e.message))));
      return;
    }
    clear(root).append(h('div', { class: 'container section center' }, h('h1', null, 'Something went wrong'), h('p', { class: 'muted', style: 'margin:12px 0 24px' }, e.message || 'Please reload the page.'), h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Reload')));
  }
}

export const planName = (id) => PLANS[id]?.name || id;

/* ---------- boot ---------- */
(async () => {
  // Email-confirmation, password-reset and Google sign-in links return here with tokens in the URL.
  const back = auth.takeRedirect();
  try {
    const [cfg, me] = await Promise.all([get('/config').catch(() => ({})), get('/me').catch(() => ({ user: null }))]);
    state.config = cfg;
    state.user = me.user;
  } catch { /* render anyway */ }
  // Returning from the payment page: confirm with the server, then show the result on the Account page.
  const q = new URLSearchParams(location.search);
  if (q.get('cvcpay') && q.get('tx_ref')) {
    const txRef = q.get('tx_ref');
    history.replaceState({}, '', location.pathname + '#/app/account#plans');
    if (state.user) {
      try {
        const { result, user } = await post('/billing/verify', { txRef });
        state.user = user;
        if (result.status === 'succeeded') toast(`Payment received. You are now on ${user.plan.name}.`);
        else if (result.status === 'pending') toast('Your payment is still being confirmed. This page will update once it goes through.', 'info');
        else if (result.status === 'mismatch') toast('The amount received did not match. Please contact support with your payment reference.', 'error');
        else toast('The payment was not completed, so you have not been charged.', 'error');
      } catch (e) { toast(e.message, 'error'); }
    }
  } else if (back?.error) { history.replaceState({}, '', location.pathname + '#/login'); toast(back.error, 'error'); }
  else if (back?.type === 'recovery') history.replaceState({}, '', location.pathname + '#/reset');
  else if (back && state.user) history.replaceState({}, '', location.pathname + '#/app');
  render();
})();
