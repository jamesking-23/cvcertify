import { h, toast, setBusy, modal } from '../ui.js';
import { patch, del } from '../api.js';
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

  const delBtn = h('button', { class: 'btn btn-danger', onclick: async () => {
    const email = h('input', { class: 'input', placeholder: u.email, 'aria-label': 'Type your email to confirm' });
    const ok = await modal({ title: 'Delete your CV-Certify data?', body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'This permanently deletes your CV-Certify profile, resumes and letters, and revokes every document ID you issued. Your sign-in stays active because it is shared with other apps on the same account. Type your email to confirm.'), email), actions: [{ label: 'Cancel', value: false }, { label: 'Delete everything', value: true, class: 'btn-primary' }] });
    if (!ok) return;
    try { await del('/me', { confirm: email.value }); state.user = null; toast('Your CV-Certify data was deleted.'); navigate('/', { replace: true }); } catch (e) { toast(e.message, 'error'); }
  } }, 'Delete my data');

  return h('div', { style: 'max-width:960px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Account'), h('p', null, u.email))),
    h('div', { class: 'card stack' }, h('div', { class: 'row spread' }, h('h3', null, 'Your plan'), h('span', { class: 'chip chip-brand' }, 'Free')), h('p', { class: 'muted' }, 'Everything on CV-Certify is free: unlimited resumes, every template, cover letters, ATS scanner, interview prep, skill roadmaps, portfolio and document verification. AI writing has a generous monthly fair-use allowance so it stays available for everyone.'), u.plan.limits.rewrites != null && h('div', { class: 'muted small' }, `${u.plan.usage.rewrites} of ${u.plan.limits.rewrites} AI actions used this month.`)),
    h('div', { class: 'grid grid-2', style: 'margin-top:36px;align-items:start' },
      h('div', { class: 'card stack' }, h('h3', null, 'Profile'), h('div', { class: 'field' }, h('label', null, 'Full name'), name), h('div', null, saveName)),
      u.hasPassword && h('div', { class: 'card stack' }, h('h3', null, 'Password'), h('div', { class: 'field' }, h('label', null, 'New password'), nw), h('div', null, savePw))),
    h('div', { class: 'card', style: 'margin-top:20px' }, h('h3', null, 'Danger zone'), h('p', { class: 'muted small', style: 'margin:6px 0 14px' }, 'Deleting your CV-Certify data cannot be undone.'), delBtn));
}
