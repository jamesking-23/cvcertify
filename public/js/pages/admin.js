// Admin console. Everything here is gated twice: the menu only shows for admins, and every database function
// re-checks the caller is in cvc_admins, so a non-admin who opens this URL just gets "no access".
import { h, icon, toast, fmtDate, clear } from '../ui.js';
import { post } from '../api.js';
import { state } from '../main.js';
import { COUNTRIES } from '../shared/constants.js';

const num = (n) => Number(n || 0).toLocaleString('en-US');
const TABS = [['overview', 'Overview'], ['users', 'Users'], ['activity', 'Activity log']];

export default function adminPage() {
  if (!state.user?.isAdmin) return h('div', { class: 'empty' }, h('h3', null, 'No access'), h('p', null, 'This area is for CV-Certify administrators.'), h('a', { class: 'btn btn-primary', href: '/app', style: 'margin-top:16px' }, 'Back to dashboard'));
  const body = h('div', { class: 'stack', style: 'margin-top:18px' });
  let current = (new URLSearchParams(location.hash.split('?')[1]?.split('#')[0] || '').get('tab')) || 'overview';
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const views = { overview, users, activity };
  const show = async (id) => {
    current = id;
    tabs.replaceChildren(...TABS.map(([k, label]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(k === id), onclick: () => show(k) }, label)));
    clear(body).append(h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
    try { clear(body).append(await views[id]()); } catch (e) { clear(body).append(h('div', { class: 'alert alert-warn' }, icon('alert'), e.message)); }
  };
  show(TABS.some(([k]) => k === current) ? current : 'overview');
  return h('div', null, h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Admin'), h('p', null, 'Visitors, users and activity.'))), tabs, body);
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
        stat('AI actions this month', num(t.aiRewritesThisMonth))),
      h('div', { class: 'grid grid-2' },
        h('div', { class: 'card stack' }, h('h3', null, 'Visitors per day'), bars(s.daily, 'visitors', 'Visitors per day')),
        h('div', { class: 'card stack' }, h('h3', null, 'New accounts per day'), bars(s.daily, 'signups', 'New accounts per day'))),
      h('div', { class: 'grid grid-4' },
        stat('Resumes', num(t.resumes)), stat('Cover letters', num(t.letters)), stat('Certified documents', num(t.certified))),
      h('div', { class: 'grid grid-2' },
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
        h('thead', null, h('tr', null, ['Name', 'Email', 'Region', 'Resumes', 'Joined'].map((x) => h('th', null, x)))),
        h('tbody', null, r.rows.map((u) => h('tr', null,
          h('td', null, u.name || '—'), h('td', null, u.email), h('td', null, u.country),
          h('td', null, String(u.resumes)), h('td', null, fmtDate(u.createdAt))))))),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-outline btn-sm', disabled: offset === 0, onclick: () => { offset = Math.max(0, offset - 25); load(); } }, 'Previous'),
        h('button', { class: 'btn btn-outline btn-sm', disabled: offset + 25 >= r.total, onclick: () => { offset += 25; load(); } }, 'Next')));
  };
  await load();
  return h('div', { class: 'stack' }, search, out);
}

async function activity() {
  const { events } = await post('/admin/audit');
  if (!events.length) return h('div', { class: 'empty' }, h('h3', null, 'Nothing here yet'), h('p', null, 'Every admin action (creating codes, changing plans) is recorded here.'));
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', null, h('tr', null, ['When', 'Admin', 'Action', 'Details'].map((x) => h('th', null, x)))),
    h('tbody', null, events.map((e) => h('tr', null, h('td', null, new Date(e.at).toLocaleString()), h('td', null, e.admin || '—'), h('td', null, e.action), h('td', { class: 'small muted' }, JSON.stringify(e.detail)))))));
}
