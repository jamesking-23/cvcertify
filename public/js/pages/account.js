import { h, icon, toast, setBusy, modal, fmtDate } from '../ui.js';
import { get, patch, post, del } from '../api.js';
import { PLANS, PLAN_ORDER } from '../shared/constants.js';
import { state, setUser, navigate } from '../main.js';
import { formatPrice, isApprox } from '../shared/currency.js';
import { MANUAL_PAY } from '../config.js';

const MONTH_CHOICES = [1, 3, 12];
const ugx = (n) => 'UGX ' + n.toLocaleString('en-US');
const STATUS = { succeeded: ['Paid', 'chip-brand'], pending: ['Pending', 'chip-gold'], failed: ['Failed', ''], cancelled: ['Cancelled', ''] };

// Opens the checkout chooser. The server recomputes the price from the plan, so what is shown here is only a preview.
async function payModal(planId) {
  const p = PLANS[planId];
  const cfg = await get('/billing/config').catch(() => ({ enabled: false }));
  const manualNets = [['mtn', 'MTN Mobile Money'], ['airtel', 'Airtel Money']].filter(([k]) => MANUAL_PAY[k]);
  const methods = [cfg.enabled && ['online', 'Card or mobile money (instant)'], manualNets.length && ['manual', 'Send mobile money myself (confirmed within a day)']].filter(Boolean);
  if (!methods.length) return modal({ title: 'Payments are not open yet', body: h('p', { class: 'muted' }, 'Online payments are being set up. If you have a redeem code, enter it on this page, or write to us and we will help.'), actions: [{ label: 'OK', value: true, class: 'btn-primary' }] });

  let months = 1;
  let method = methods[0][0];
  const total = () => p.price * months;
  const totalEl = h('div', { class: 'pay-total' });
  const paint = () => { totalEl.replaceChildren(h('strong', null, ugx(total())), isApprox() ? h('span', { class: 'muted small' }, ` (about ${formatPrice(total())})`) : ''); };
  const opts = MONTH_CHOICES.map((m) => h('label', { class: 'pay-opt' }, h('input', { type: 'radio', name: 'months', checked: m === 1, onchange: () => { months = m; paint(); } }), h('span', null, h('b', null, m === 12 ? '12 months' : `${m} month${m > 1 ? 's' : ''}`), h('small', { class: 'muted' }, ugx(p.price * m)))));
  paint();
  const how = methods.length > 1 ? h('div', { class: 'pay-opts' }, methods.map(([k, label], i) => h('label', { class: 'pay-opt' }, h('input', { type: 'radio', name: 'method', checked: i === 0, onchange: () => { method = k; } }), h('span', null, h('b', null, label))))) : null;
  const go = await modal({
    title: `Get ${p.name}`,
    body: h('div', { class: 'stack' },
      h('p', { class: 'muted' }, `${p.name}. You pay once for the period you choose. It does not renew by itself, so you are never charged without asking.`),
      h('div', { class: 'pay-opts' }, opts), h('div', { class: 'row spread' }, h('span', null, 'Total today'), totalEl),
      how, h('p', { class: 'muted small' }, methods.some(([k]) => k === 'online') ? 'Card and mobile money are paid on Flutterwave’s secure page. CV-Certify never sees your card or PIN.' : 'You will send the money from your own phone. We never ask for your PIN.')),
    actions: [{ label: 'Cancel', value: false }, { label: 'Continue', value: true, class: 'btn-primary' }],
  });
  if (!go) return;
  if (method === 'online') {
    try { const out = await post('/billing/checkout', { plan: planId, months }); location.assign(out.link); } catch (e) { toast(e.message, 'error'); }
    return;
  }
  return manualModal(planId, months, manualNets);
}

// Customer pays from their own phone, then tells us the transaction ID. An admin matches it to the statement and approves.
async function manualModal(planId, months, nets) {
  const p = PLANS[planId];
  const amount = p.price * months;
  const network = h('select', { class: 'input' }, nets.map(([k, label]) => h('option', { value: k }, label)));
  const to = h('div', { class: 'card stack', style: 'background:var(--ink-50)' });
  const paintTo = () => { const num = MANUAL_PAY[network.value]; to.replaceChildren(h('div', { class: 'muted small' }, 'Send exactly'), h('div', { class: 'pay-total' }, h('strong', null, ugx(amount))), h('div', { class: 'muted small' }, 'to'), h('div', null, h('strong', { class: 'mono' }, num), MANUAL_PAY.name ? h('span', { class: 'muted' }, `  ·  ${MANUAL_PAY.name}`) : '')); };
  network.addEventListener('change', paintTo); paintTo();
  const phone = h('input', { class: 'input', type: 'tel', placeholder: 'The number you paid from, e.g. 0772 123 456', autocomplete: 'tel' });
  const ref = h('input', { class: 'input', placeholder: 'Transaction ID from the confirmation SMS', autocomplete: 'off' });
  const ok = await modal({
    title: 'Pay by mobile money',
    body: h('div', { class: 'stack' },
      h('ol', { class: 'muted', style: 'margin:0;padding-left:18px;display:grid;gap:6px' }, h('li', null, 'Choose your network and send the amount below.'), h('li', null, 'Wait for the confirmation SMS and copy the transaction ID.'), h('li', null, 'Enter it here. We confirm it, usually the same day, and your plan switches on.')),
      h('div', { class: 'field' }, h('label', null, 'Network'), network), to,
      h('div', { class: 'field' }, h('label', null, 'Your phone number'), phone), h('div', { class: 'field' }, h('label', null, 'Transaction ID'), ref)),
    actions: [{ label: 'Cancel', value: false }, { label: 'I have paid', value: true, class: 'btn-primary' }],
  });
  if (!ok) return;
  try {
    await post('/billing/manual', { plan: planId, months, network: network.value, phone: phone.value, ref: ref.value });
    toast('Thank you. We will confirm your payment shortly and switch your plan on.');
    navigate('/app/account#plans', { replace: true });
  } catch (e) {
    toast(e.message, 'error');
    return manualModal(planId, months, nets);
  }
}

function redeemCard() {
  const input = h('input', { class: 'input', placeholder: 'CVC-XXXX-XXXX-XXXX', autocomplete: 'off', spellcheck: 'false', style: 'text-transform:uppercase', 'aria-label': 'Redeem code' });
  const btn = h('button', { class: 'btn btn-outline', onclick: async () => {
    if (!input.value.trim()) return toast('Enter your code first.', 'error');
    setBusy(btn, true, 'Checking…');
    try { const { user } = await post('/billing/redeem', { code: input.value }); setUser(user); toast(`Code accepted. You are on ${user.plan.name} until ${fmtDate(user.plan.expiresAt)}.`); navigate('/app/account#plans', { replace: true }); } catch (e) { toast(e.message, 'error'); setBusy(btn, false); }
  } }, 'Redeem');
  return h('div', { class: 'card stack' }, h('h3', null, 'Have a code?'), h('p', { class: 'muted small' }, 'Redeem a code to unlock a plan without paying. Codes are given out for events, partners and special cases.'), h('div', { class: 'row' }, input, btn));
}

function historyCard() {
  const box = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, 'Loading…'));
  get('/billing/history').then(({ payments }) => {
    const rows = payments.map((x) => {
      const [text, cls] = STATUS[x.status] || [x.status, ''];
      return h('div', { class: 'row spread small' },
        h('span', null, `${PLANS[x.plan]?.name || x.plan} · ${x.months} mo`, h('span', { class: 'muted' }, ` · ${fmtDate(x.paid_at || x.created_at)}`)),
        h('span', { class: 'row' }, ugx(x.amount), h('span', { class: `chip ${cls}` }, text)));
    });
    box.replaceChildren(...(rows.length ? rows : [h('p', { class: 'muted small' }, 'No payments yet.')]));
  }).catch(() => box.replaceChildren(h('p', { class: 'muted small' }, 'Payment history is unavailable right now.')));
  return h('div', { class: 'card stack' }, h('h3', null, 'Payments'), box);
}

export default function accountPage() {
  const u = state.user;
  const name = h('input', { class: 'input', value: u.name, autocomplete: 'name' });
  const saveName = h('button', { class: 'btn btn-outline', onclick: async () => {
    setBusy(saveName, true, 'Saving…');
    try { const { user } = await patch('/me', { name: name.value }); setUser(user); toast('Name updated.'); } catch (e) { toast(e.message, 'error'); }
    setBusy(saveName, false);
  } }, 'Save');

  const nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters' });
  const savePw = h('button', { class: 'btn btn-outline', onclick: async () => {
    setBusy(savePw, true, 'Updating…');
    try { await patch('/me', { newPassword: nw.value }); nw.value = ''; toast('Password updated.'); } catch (e) { toast(e.message, 'error'); }
    setBusy(savePw, false);
  } }, 'Update password');

  const plans = h('div', { class: 'grid grid-3', id: 'plans', style: 'scroll-margin-top:24px' }, PLAN_ORDER.map((id) => {
    const p = PLANS[id];
    const current = u.plan.id === id;
    const idx = PLAN_ORDER.indexOf(id);
    const rank = PLAN_ORDER.indexOf(u.plan.id);
    const lower = idx < rank;
    const label = current ? (id === 'starter' ? 'Current plan' : 'Add more time') : lower ? 'Included in your plan' : id === 'starter' ? 'Free forever' : 'Choose ' + p.name;
    const btn = h('button', { class: `btn btn-block ${current && id === 'starter' ? 'btn-ghost' : id === 'professional' ? 'btn-primary' : 'btn-outline'}`, disabled: id === 'starter' || lower, onclick: () => payModal(id) }, label);
    const until = current && id !== 'starter' && u.plan.expiresAt ? h('div', { class: 'muted small' }, `Active until ${fmtDate(u.plan.expiresAt)}`) : null;
    return h('div', { class: `price-card${current ? '' : ''}`, style: current ? 'border-color:var(--brand-500);box-shadow:var(--focus)' : '' }, h('div', { class: 'row spread' }, h('div', { class: 'tier' }, p.name), current && h('span', { class: 'chip chip-brand' }, 'Current')), h('div', { class: 'price' }, p.price ? [formatPrice(p.price), h('small', null, '/mo')] : 'Free'), h('ul', null, p.features.map((f) => h('li', null, icon('check'), f))), until, btn);
  }));

  const delBtn = h('button', { class: 'btn btn-danger', onclick: async () => {
    const email = h('input', { class: 'input', placeholder: u.email, 'aria-label': 'Type your email to confirm' });
    const ok = await modal({ title: 'Delete your CV-Certify data?', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'This permanently deletes your CV-Certify profile, resumes and letters, and revokes every document ID you issued. Your sign-in stays active because it is shared with other apps on the same account. Type your email to confirm.'), email), actions: [{ label: 'Cancel', value: false }, { label: 'Delete everything', value: true, class: 'btn-primary' }] });
    if (!ok) return;
    try { await del('/me', { confirm: email.value }); state.user = null; toast('Your CV-Certify data was deleted.'); navigate('/', { replace: true }); } catch (e) { toast(e.message, 'error'); }
  } }, 'Delete my data');

  return h('div', { style: 'max-width:960px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Account & plan'), h('p', null, u.email))),
    h('h2', { style: 'font-size:20px;margin-bottom:14px' }, 'Plan'), plans,
    u.plan.expired && h('div', { class: 'alert alert-warn', style: 'margin-top:14px' }, icon('alert'), 'Your paid plan has ended, so your account is back on Starter. Your data is kept. Renew any time.'),
    h('div', { class: 'grid grid-2', style: 'margin-top:20px;align-items:start' }, redeemCard(), historyCard()),
    h('div', { class: 'grid grid-2', style: 'margin-top:36px;align-items:start' },
      h('div', { class: 'card stack' }, h('h3', null, 'Profile'), h('div', { class: 'field' }, h('label', null, 'Full name'), name), h('div', null, saveName)),
      u.hasPassword && h('div', { class: 'card stack' }, h('h3', null, 'Password'), h('div', { class: 'field' }, h('label', null, 'New password'), nw), h('div', null, savePw))),
    h('div', { class: 'card', style: 'margin-top:20px' }, h('h3', null, 'Danger zone'), h('p', { class: 'muted small', style: 'margin:6px 0 14px' }, 'Deleting your CV-Certify data cannot be undone.'), delBtn));
}
