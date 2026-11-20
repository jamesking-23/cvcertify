// Admin console. Everything here is gated twice: the menu only shows for admins, and every database function
// re-checks the caller is in cvc_admins, so a non-admin who opens this URL just gets "no access".
import { h, icon, toast, setBusy, fmtDate, copyText, clear, modal } from '../ui.js';
import { post } from '../api.js';
import { state } from '../main.js';
import { COUNTRIES } from '../shared/constants.js';

const num = (n) => Number(n || 0).toLocaleString('en-US');
const ugx = (n) => 'UGX ' + num(n);
const TABS = [['overview', 'Overview'], ['users', 'Users'], ['payments', 'Payments'], ['codes', 'Redeem codes'], ['activity', 'Activity log']];

export default function adminPage() {
  if (!state.user?.isAdmin) return h('div', { class: 'empty' }, h('h3', null, 'No access'), h('p', null, 'This area is for CV-Certify administrators.'), h('a', { class: 'btn btn-primary', href: '/app', style: 'margin-top:16px' }, 'Back to dashboard'));
  const body = h('div', { class: 'stack', style: 'margin-top:18px' });
  let current = (new URLSearchParams(location.hash.split('?')[1]?.split('#')[0] || '').get('tab')) || 'overview';
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const views = { overview, users, payments, codes, activity };
  const show = async (id) => {
    current = id;
    tabs.replaceChildren(...TABS.map(([k, label]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(k === id), onclick: () => show(k) }, label)));
    clear(body).append(h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
    try { clear(body).append(await views[id]()); } catch (e) { clear(body).append(h('div', { class: 'alert alert-warn' }, icon('alert'), e.message)); }
  };
  show(TABS.some(([k]) => k === current) ? current : 'overview');
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Admin'), h('p', null, 'Visitors, users, payments and redeem codes.'))), tabs, body);
}

const stat = (label, value, sub) => h('div', { class: 'card stat' }, h('div', { class: 'muted small' }, label), h('div', { class: 'stat-n' }, value), sub && h('div', { class: 'muted small' }, sub));

function bars(rows, key, label) {
  const max = Math.max(1, ...rows.map((r) => r[key]));
  return h('div', { class: 'bars', role: 'img', 'aria-label': label },
    rows.map((r) => h('div', { class: 'bar-col', title: `${r.day}: ${num(r[key])}` }, h('i', { style: `height:${Math.max(2, (r[key] / max) * 100)}%` }))));
}

async function overview() {
  let days = 30;
  const root = h('div', { class: 'stack' });
  const paint = async () => {
    const s = await post('/admin/stats', { days });
    const t = s.totals, p = s.period;
    const range = h('div', { class: 'row' }, [7, 30, 90].map((d) => h('button', { class: `btn btn-sm ${d === days ? 'btn-primary' : 'btn-outline'}`, onclick: () => { days = d; paint().catch((e) => toast(e.message, 'error')); } }, `${d} days`)));
    clear(root).append(
      range,
      h('div', { class: 'grid grid-4' },
        stat('Visitors', num(p.visitors), `${num(p.views)} page views`),
        stat('New accounts', num(p.newUsers), `${num(t.users)} in total`),
        stat('Revenue', ugx(p.revenue), `${num(p.payments)} payments · ${ugx(t.revenueAllTime)} all time`),
        stat('Paying right now', num(t.paying), `${num(p.redemptions)} codes redeemed`)),
      h('div', { class: 'grid grid-2' },
        h('div', { class: 'card stack' }, h('h3', null, 'Visitors per day'), bars(s.daily, 'visitors', 'Visitors per day')),
        h('div', { class: 'card stack' }, h('h3', null, 'New accounts per day'), bars(s.daily, 'signups', 'New accounts per day'))),
      h('div', { class: 'grid grid-4' },
        stat('Resumes', num(t.resumes)), stat('Cover letters', num(t.letters)), stat('Certified documents', num(t.certified)), stat('AI rewrites this month', num(t.aiRewritesThisMonth))),
      h('div', { class: 'grid grid-3' },
        list('Plans', s.plans.map((x) => [x.plan, num(x.count)])),
        list('Account regions', s.countries.map((x) => [COUNTRIES[x.country]?.name || x.country, num(x.count)])),
        list('Top pages', s.topPages.map((x) => [x.path || '/', num(x.views)]), 'No visits recorded yet.')),
      list('Where visitors come from', s.topReferrers.map((x) => [x.ref, num(x.visitors)]), 'No referrers yet. Direct visits are not listed.'),
      h('p', { class: 'muted small' }, 'Visits are counted with a random ID kept in the browser, with no cookies and no IP address stored. Visitors who send “Do Not Track” are not counted.'));
  };
  await paint();
  return root;
}

function list(title, rows, empty = 'Nothing yet.') {
  return h('div', { class: 'card stack' }, h('h3', null, title), rows.length ? rows.map(([a, b]) => h('div', { class: 'row spread small' }, h('span', null, a), h('b', null, b))) : h('p', { class: 'muted small' }, empty));
}

async function users() {
  let q = '', offset = 0;
  const out = h('div', { class: 'stack' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search by name or email', 'aria-label': 'Search users', onkeydown: (e) => { if (e.key === 'Enter') { q = search.value.trim(); offset = 0; load(); } } });
  const load = async () => {
    const r = await post('/admin/users', { q, offset });
    clear(out).append(
      h('div', { class: 'muted small' }, `${num(r.total)} user${r.total === 1 ? '' : 's'}`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
        h('thead', null, h('tr', null, ['Name', 'Email', 'Region', 'Plan', 'Resumes', 'Joined', ''].map((x) => h('th', null, x)))),
        h('tbody', null, r.rows.map((u) => h('tr', null,
          h('td', null, u.name || '—'), h('td', null, u.email), h('td', null, u.country),
          h('td', null, h('span', { class: `chip ${u.plan !== 'starter' ? 'chip-brand' : ''}` }, u.plan), u.expiresAt && u.plan !== 'starter' ? h('div', { class: 'muted small' }, `until ${fmtDate(u.expiresAt)}`) : null),
          h('td', null, String(u.resumes)), h('td', null, fmtDate(u.createdAt)),
          h('td', null, h('button', { class: 'btn btn-outline btn-sm', onclick: () => grant(u, load) }, 'Change plan'))))))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-outline btn-sm', disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - 25); load(); } }, 'Previous'),
        h('button', { class: 'btn btn-outline btn-sm', disabled: offset + 25 >= r.total, onclick: () => { offset += 25; load(); } }, 'Next')));
  };
  await load();
  return h('div', { class: 'stack' }, search, out);
}

async function grant(u, reload) {
  const plan = h('select', { class: 'input' }, ['starter', 'professional', 'career'].map((x) => h('option', { value: x, selected: x === 'professional' }, x)));
  const days = h('input', { class: 'input', type: 'number', min: '0', max: '3660', value: '30' });
  const ok = await modal({ title: `Change plan for ${u.email}`, body: h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', null, 'Plan'), plan), h('div', { class: 'field' }, h('label', null, 'Days of access (ignored for Starter)'), days), h('p', { class: 'muted small' }, 'This replaces their current access and is recorded in the activity log.')), actions: [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, class: 'btn-primary' }] });
  if (!ok) return;
  try { await post('/admin/grant', { userId: u.id, plan: plan.value, days: Number(days.value) }); toast('Plan updated.'); reload(); } catch (e) { toast(e.message, 'error'); }
}

async function payments() {
  const { payments: rows } = await post('/admin/payments');
  if (!rows.length) return h('div', { class: 'empty' }, h('h3', null, 'No payments yet'), h('p', null, 'Payments appear here as soon as a customer starts checkout or submits a mobile money payment.'));
  const review = async (p, approve) => {
    const ok = await modal({ title: approve ? 'Approve this payment?' : 'Reject this payment?', body: h('div', { class: 'stack' }, h('p', null, `${p.email}: ${p.plan} for ${p.months} month${p.months > 1 ? 's' : ''}, ${ugx(p.amount)}.`), h('p', { class: 'muted small' }, approve ? `Only approve if your ${p.method === 'airtel' ? 'Airtel' : 'MTN'} statement shows ${ugx(p.amount)} received with transaction ID ${p.providerRef}.` : 'The customer keeps the Starter plan and can submit again.')), actions: [{ label: 'Cancel', value: false }, { label: approve ? 'Approve and grant plan' : 'Reject', value: true, class: 'btn-primary' }] });
    if (!ok) return;
    try { await post('/admin/payments/review', { id: p.id, approve }); toast(approve ? 'Approved. The plan is active.' : 'Rejected.'); show('payments'); } catch (e) { toast(e.message, 'error'); }
  };
  const waiting = rows.filter((p) => p.provider === 'manual' && p.status === 'pending');
  return h('div', { class: 'stack' },
    waiting.length ? h('div', { class: 'card stack', style: 'border-color:var(--gold-500,#c9a227)' }, h('h3', null, `${waiting.length} mobile money payment${waiting.length > 1 ? 's' : ''} waiting for you`),
      waiting.map((p) => h('div', { class: 'row spread' }, h('div', null, h('b', null, `${ugx(p.amount)} · ${p.method === 'airtel' ? 'Airtel' : 'MTN'}`), h('div', { class: 'small muted' }, `${p.email} · from ${p.payerPhone} · ID ${p.providerRef} · ${fmtDate(p.createdAt)}`)),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-primary btn-sm', onclick: () => review(p, true) }, 'Approve'), h('button', { class: 'btn btn-outline btn-sm', onclick: () => review(p, false) }, 'Reject'))))) : null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Date', 'Customer', 'Plan', 'Amount', 'Method', 'Status', 'Reference'].map((x) => h('th', null, x)))),
      h('tbody', null, rows.map((p) => h('tr', null, h('td', null, fmtDate(p.paidAt || p.createdAt)), h('td', null, p.email || '—'), h('td', null, `${p.plan} · ${p.months} mo`), h('td', null, ugx(p.amount)), h('td', null, p.provider === 'manual' ? `Manual ${p.method}` : (p.method || '—')),
        h('td', null, h('span', { class: `chip ${p.status === 'succeeded' ? 'chip-brand' : p.status === 'pending' ? 'chip-gold' : ''}` }, p.status)), h('td', { class: 'small muted' }, p.providerRef || p.txRef)))))));
}

async function codes() {
  const wrap = h('div', { class: 'stack' });
  const plan = h('select', { class: 'input' }, h('option', { value: 'professional' }, 'Professional'), h('option', { value: 'career' }, 'Career+'));
  const days = h('input', { class: 'input', type: 'number', min: '1', max: '3660', value: '30' });
  const count = h('input', { class: 'input', type: 'number', min: '1', max: '200', value: '1' });
  const uses = h('input', { class: 'input', type: 'number', min: '1', max: '100000', value: '1' });
  const exp = h('input', { class: 'input', type: 'date' });
  const note = h('input', { class: 'input', maxlength: '200', placeholder: 'Who or what is this for? (only you see this)' });
  const fresh = h('div');
  const btn = h('button', { class: 'btn btn-primary', onclick: async () => {
    setBusy(btn, true, 'Generating…');
    try {
      const { codes: made } = await post('/admin/codes/create', { plan: plan.value, days: Number(days.value), count: Number(count.value), maxUses: Number(uses.value), expiresAt: exp.value ? new Date(exp.value + 'T23:59:59').toISOString() : null, note: note.value });
      const text = made.join('\n');
      clear(fresh).append(h('div', { class: 'card stack', style: 'border-color:var(--brand-500)' }, h('b', null, `${made.length} new code${made.length > 1 ? 's' : ''}`), h('pre', { class: 'codes' }, text), h('div', null, h('button', { class: 'btn btn-outline btn-sm', onclick: async () => { await copyText(text); toast('Copied.'); } }, 'Copy all'))));
      await refresh();
    } catch (e) { toast(e.message, 'error'); }
    setBusy(btn, false);
  } }, 'Generate codes');
  const table = h('div');
  const refresh = async () => {
    const { codes: rows } = await post('/admin/codes');
    clear(table).append(rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Code', 'Plan', 'Days', 'Used', 'Expires', 'Note', ''].map((x) => h('th', null, x)))),
      h('tbody', null, rows.map((c) => h('tr', { style: c.active ? '' : 'opacity:.55' }, h('td', { class: 'mono' }, c.code), h('td', null, c.plan), h('td', null, String(c.days)), h('td', null, `${c.uses} / ${c.maxUses}`), h('td', null, c.expiresAt ? fmtDate(c.expiresAt) : 'Never'), h('td', { class: 'small muted' }, c.note || ''),
        h('td', null, h('button', { class: 'btn btn-outline btn-sm', onclick: async () => { try { await post('/admin/codes/active', { code: c.code, active: !c.active }); refresh(); } catch (e) { toast(e.message, 'error'); } } }, c.active ? 'Disable' : 'Enable'))))))) : h('p', { class: 'muted' }, 'No codes yet.'));
  };
  await refresh();
  wrap.append(
    h('div', { class: 'card stack' }, h('h3', null, 'Generate redeem codes'),
      h('p', { class: 'muted small' }, 'Each code unlocks the chosen plan for the number of days you set. Codes are random and cannot be guessed. Use “Times it can be used” to make one code that a whole group shares.'),
      h('div', { class: 'grid grid-3' }, h('div', { class: 'field' }, h('label', null, 'Plan'), plan), h('div', { class: 'field' }, h('label', null, 'Days of access'), days), h('div', { class: 'field' }, h('label', null, 'How many codes'), count)),
      h('div', { class: 'grid grid-3' }, h('div', { class: 'field' }, h('label', null, 'Times each can be used'), uses), h('div', { class: 'field' }, h('label', null, 'Code expires on (optional)'), exp), h('div', { class: 'field' }, h('label', null, 'Note'), note)),
      h('div', null, btn)),
    fresh, table);
  return wrap;
}

async function activity() {
  const { events } = await post('/admin/audit');
  if (!events.length) return h('div', { class: 'empty' }, h('h3', null, 'Nothing here yet'), h('p', null, 'Every admin action (creating codes, changing plans) is recorded here.'));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['When', 'Admin', 'Action', 'Details'].map((x) => h('th', null, x)))),
    h('tbody', null, events.map((e) => h('tr', null, h('td', null, new Date(e.at).toLocaleString()), h('td', null, e.admin || '—'), h('td', null, e.action), h('td', { class: 'small muted' }, JSON.stringify(e.detail)))))));
}
