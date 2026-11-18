import { h, icon, toast, setBusy, modal, confirmDialog } from '../ui.js';
import { patch, post, del } from '../api.js';
import { PLANS, PLAN_ORDER } from '../shared/constants.js';
import { state, setUser, navigate } from '../main.js';

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
    const btn = h('button', { class: `btn btn-block ${current ? 'btn-ghost' : id === 'professional' ? 'btn-primary' : 'btn-outline'}`, disabled: current, onclick: async () => {
      if (!state.config.selfServePlans) return toast('Online payments are not enabled yet. Please contact support to change plans.', 'error');
      const down = idx < PLAN_ORDER.indexOf(u.plan.id);
      if (!(await confirmDialog(`Switch to ${p.name}?`, down ? 'Features from your current plan that are not in this one will be locked. Your data is kept.' : `This changes your plan to ${p.name}${p.price ? ` ($${p.price}/mo)` : ''}. Billing is not connected yet, so you will not be charged.`, 'Switch plan'))) return;
      setBusy(btn, true, 'Switching…');
      try { const { user } = await post('/me/plan', { plan: id }); setUser(user); toast(`You are now on ${p.name}.`); navigate('/app/account#plans', { replace: true }); } catch (e) { toast(e.message, 'error'); setBusy(btn, false); }
    } }, current ? 'Current plan' : id === 'starter' ? 'Downgrade' : 'Choose ' + p.name);
    return h('div', { class: `price-card${current ? '' : ''}`, style: current ? 'border-color:var(--brand-500);box-shadow:var(--focus)' : '' }, h('div', { class: 'row spread' }, h('div', { class: 'tier' }, p.name), current && h('span', { class: 'chip chip-brand' }, 'Current')), h('div', { class: 'price' }, p.price ? [`$${p.price}`, h('small', null, '/mo')] : 'Free'), h('ul', null, p.features.map((f) => h('li', null, icon('check'), f))), btn);
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
    !state.config.selfServePlans && h('div', { class: 'alert alert-warn', style: 'margin-top:14px' }, icon('alert'), 'Online payments are not enabled yet.'),
    h('div', { class: 'grid grid-2', style: 'margin-top:36px;align-items:start' },
      h('div', { class: 'card stack' }, h('h3', null, 'Profile'), h('div', { class: 'field' }, h('label', null, 'Full name'), name), h('div', null, saveName)),
      u.hasPassword && h('div', { class: 'card stack' }, h('h3', null, 'Password'), h('div', { class: 'field' }, h('label', null, 'New password'), nw), h('div', null, savePw))),
    h('div', { class: 'card', style: 'margin-top:20px' }, h('h3', null, 'Danger zone'), h('p', { class: 'muted small', style: 'margin:6px 0 14px' }, 'Deleting your CV-Certify data cannot be undone.'), delBtn));
}
