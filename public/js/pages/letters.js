import { h, icon, clear, toast, setBusy, confirmDialog, ago, copyText } from '../ui.js';
import { get, post, put, del, download } from '../api.js';
import { handleAiError } from '../editor-form.js';
import { upgradeCard } from './tools.js';
import { state, onLeave } from '../main.js';
import { saver } from '../util-client.js';
import { renderLetter } from '../preview.js';
import { LETTER_FORMATS } from '../shared/constants.js';

export default async function lettersPage() {
  if (!state.user.plan.limits.letters) return upgradeCard('Cover letters', 'letters');
  const [{ letters }, { resumes }] = await Promise.all([get('/letters'), get('/resumes')]);
  const host = h('div');
  let current = null;

  const listView = () => {
    clear(host).append(
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Cover letters'), h('p', null, 'Paste a job, pick a resume, and get a letter that sounds like you.')), h('button', { class: 'btn btn-brand', onclick: () => openEditor(null) }, icon('plus'), 'New letter')),
      letters.length ? h('div', { class: 'card', style: 'padding:8px 20px' }, h('div', { class: 'list' }, letters.map((l) => h('button', { class: 'list-item', style: 'width:100%;text-align:left', onclick: () => openEditor(l) }, h('div', { class: 'icon-badge' }, icon('mail')), h('div', { class: 'grow' }, h('div', { class: 'title' }, l.title), h('div', { class: 'muted small' }, `${l.job?.company ? l.job.company + ' · ' : ''}edited ${ago(l.updatedAt)}`)), icon('arrow', 'icon-sm')))))
        : h('div', { class: 'card empty' }, h('div', { class: 'icon-badge' }, icon('mail')), h('h3', null, 'No letters yet'), h('p', null, 'Generate your first cover letter from a resume and a job description.'), h('button', { class: 'btn btn-brand', style: 'margin-top:16px', onclick: () => openEditor(null) }, icon('plus'), 'Write a letter')));
  };

  const openEditor = (existing) => {
    const l = existing ? { ...existing, job: { ...existing.job } } : { id: null, title: 'Cover letter', text: '', job: { title: '', company: '', description: '' }, resumeId: resumes[0]?.id || null, format: 'formal' };
    current = l;
    const indicator = h('span', { class: 'save-state' });
    const save = saver(async () => {
      if (!l.id) { const { letter } = await post('/letters', l); l.id = letter.id; Object.assign(existingRef, letter); letters.unshift(letter); }
      else await put('/letters/' + l.id, l);
    }, indicator);
    const existingRef = {};
    onLeave(() => save.flush());

    const title = h('input', { class: 'input', value: l.title, 'aria-label': 'Letter name', oninput: () => { l.title = title.value; save(); } });
    const jt = h('input', { class: 'input', value: l.job.title, placeholder: 'Job title', oninput: () => { l.job.title = jt.value; save(); } });
    const jc = h('input', { class: 'input', value: l.job.company, placeholder: 'Company', oninput: () => { l.job.company = jc.value; save(); } });
    const jd = h('textarea', { class: 'textarea', rows: 8, placeholder: 'Paste the job description…', oninput: () => { l.job.description = jd.value; save(); } });
    jd.value = l.job.description;
    const rs = h('select', { class: 'select', onchange: () => { l.resumeId = rs.value; save(); } }, resumes.map((r) => h('option', { value: r.id, selected: r.id === l.resumeId }, r.title)));
    const tone = h('select', { class: 'select' }, ['professional', 'warm', 'confident', 'concise'].map((t) => h('option', { value: t }, t[0].toUpperCase() + t.slice(1))));
    const body = h('textarea', { class: 'textarea', rows: 18, style: 'font-family:var(--font-serif);font-size:16px;line-height:1.65', placeholder: 'Your letter appears here. You can edit it freely.', oninput: () => { l.text = body.value; save(); } });
    body.value = l.text;

    // Live preview in the chosen format, using the selected resume's contact details.
    let personal = {};
    const previewHost = h('div', { class: 'paper-wrap' });
    const drawPreview = () => clear(previewHost).append(renderLetter({ text: body.value, personal, job: l.job, format: l.format || 'formal' }));
    const loadPersonal = async () => {
      try { personal = resumes.length ? (await get('/resumes/' + (rs.value || l.resumeId))).resume.content.personal : (await get('/profile')).content.personal; } catch { personal = {}; }
      drawPreview();
    };
    body.addEventListener('input', drawPreview);
    jt.addEventListener('input', drawPreview);
    jc.addEventListener('input', drawPreview);
    rs.addEventListener('change', loadPersonal);
    const fmtBtns = LETTER_FORMATS.map((f) => h('button', { type: 'button', class: 'chip-btn', 'aria-pressed': (l.format || 'formal') === f.id, title: f.desc, onclick: () => { l.format = f.id; fmtBtns.forEach((b, i) => b.setAttribute('aria-pressed', LETTER_FORMATS[i].id === f.id)); fmtNote.textContent = f.desc; drawPreview(); save(); } }, f.name));
    const fmtNote = h('p', { class: 'hint' }, LETTER_FORMATS.find((f) => f.id === (l.format || 'formal')).desc);
    loadPersonal();

    const gen = h('button', { class: 'btn btn-brand', onclick: async () => {
      if (!resumes.length) return toast('Create a resume first. The letter is written from it.', 'error');
      if (jd.value.trim().length < 40) { toast('Paste the job description first.', 'error'); return jd.focus(); }
      if (body.value.trim() && !(await confirmDialog('Replace the current letter?', 'Generating a new draft overwrites the text in the editor.', 'Replace'))) return;
      setBusy(gen, true, 'Writing…');
      try {
        const { resume } = await get('/resumes/' + (rs.value || l.resumeId));
        const out = await post('/ai/letter', { content: resume.content, job: l.job, tone: tone.value, country: resume.country });
        body.value = l.text = out.letter;
        save();
        if (out.mode === 'basic') toast('Draft written from your profile. Read it through and make it yours.');
      } catch (e) { handleAiError(e); }
      setBusy(gen, false);
      gen.prepend(icon('sparkles'));
    } }, icon('sparkles'), l.text ? 'Regenerate' : 'Generate letter');

    clear(host).append(
      h('div', { class: 'page-head' }, h('div', null, h('button', { class: 'muted small', onclick: async () => { await save.flush(); listView(); } }, '← All letters'), h('div', { style: 'margin-top:6px;max-width:420px' }, title)),
        h('div', { class: 'row row-wrap' }, indicator,
          h('button', { class: 'btn btn-outline', onclick: () => copyText(body.value) }, icon('copy'), 'Copy'),
          h('button', { class: 'btn btn-outline', onclick: async () => { await save.flush(); if (!l.id) return toast('Write something first.', 'error'); try { await download(`/letters/${l.id}/export`, 'cover-letter.docx'); } catch (e) { toast(e.message, 'error'); } } }, icon('download'), 'Word (.docx)'),
          l.id && h('button', { class: 'btn btn-danger', onclick: async () => { if (await confirmDialog('Delete this letter?', 'This cannot be undone.', 'Delete', true)) { await del('/letters/' + l.id); letters.splice(letters.findIndex((x) => x.id === l.id), 1); save.flush = async () => {}; listView(); } } }, icon('trash')))),
      h('div', { class: 'editor' },
        h('div', { class: 'card stack' }, h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Resume'), rs), h('div', { class: 'field' }, h('label', null, 'Tone'), tone), h('div', { class: 'field' }, h('label', null, 'Job title'), jt), h('div', { class: 'field' }, h('label', null, 'Company'), jc), h('div', { class: 'field span-2' }, h('label', null, 'Job description'), jd)), h('div', null, gen)),
        h('div', { class: 'stack' }, h('div', { class: 'card' }, h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Letter text'), body), h('div', { class: 'card stack' }, h('div', { class: 'label' }, 'Layout'), h('div', { class: 'row row-wrap' }, fmtBtns), fmtNote, previewHost))));
  };

  listView();
  return host;
}
