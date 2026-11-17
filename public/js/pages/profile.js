import { h, icon, toast, setBusy, confirmDialog } from '../ui.js';
import { get, put, post, patch } from '../api.js';
import { contentForm } from '../editor-form.js';
import { saver } from '../util-client.js';
import { COUNTRIES } from '../shared/constants.js';
import { onLeave, state, navigate, setUser } from '../main.js';

export default async function profilePage() {
  const { content } = await get('/profile');
  const indicator = h('span', { class: 'save-state' });
  const save = saver(() => put('/profile', { content }), indicator);
  onLeave(() => save.flush());

  const ai = {
    summary: async () => (await post('/ai/summary', { content })).summary,
    bullets: async (e) => (await post('/ai/bullets', { bullets: e.bullets, role: e.role, company: e.company })).bullets,
  };

  const countrySel = h('select', { class: 'select', 'aria-label': 'Default country format', style: 'max-width:260px', onchange: async () => {
    try { const { user } = await patch('/me', { country: countrySel.value }); setUser(user); toast('Default format updated.'); } catch (e) { toast(e.message, 'error'); }
  } }, Object.values(COUNTRIES).map((c) => h('option', { value: c.id, selected: c.id === (state.user.country || 'US') }, `${c.name} (${c.doc})`)));

  const makeBtn = h('button', { class: 'btn btn-brand', onclick: async () => {
    await save.flush();
    setBusy(makeBtn, true, 'Creating…');
    try {
      const { resume } = await post('/resumes', { title: `${content.personal.fullName || 'My'} resume`, country: state.user.country });
      navigate('/app/resumes/' + resume.id);
    } catch (e) {
      if (e.status === 402) toast(e.message, 'error'); else toast(e.message, 'error');
      setBusy(makeBtn, false);
    }
  } }, icon('file'), 'Create resume from profile');

  return h('div', { class: 'container-sm', style: 'max-width:820px' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Master profile'), h('p', null, 'Enter your experience once. Every resume and cover letter starts from this.')), h('div', { class: 'row' }, indicator, makeBtn)),
    h('div', { class: 'alert alert-info', style: 'margin-bottom:20px' }, icon('sparkles'), h('div', null, 'Your profile is saved automatically. Resumes you create copy it, so you can tailor each one without losing your original.')),
    h('div', { class: 'field', style: 'margin-bottom:20px' }, h('label', null, 'Default country format'), countrySel),
    contentForm(content, save, { country: state.user.country || 'US', ai }));
}
