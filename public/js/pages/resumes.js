import { h, icon, clear, toast, setBusy, confirmDialog, modal, ago, fmtDate, copyText, debounce } from '../ui.js';
import { get, post, put, del, download } from '../api.js';
import { contentForm, handleAiError } from '../editor-form.js';
import { saver } from '../util-client.js';
import { renderPaper } from '../preview.js';
import { TEMPLATES, COUNTRIES } from '../shared/constants.js';
import { onLeave, state, navigate } from '../main.js';
import { atsResultView } from './tools.js';

/* ================= list ================= */
export async function list() {
  const { resumes } = await get('/resumes');
  const limit = state.user.plan.limits.resumes;
  const atLimit = limit != null && resumes.length >= limit;

  const create = async () => {
    if (atLimit) return toast(`Your ${state.user.plan.name} plan includes ${limit} resumes. Upgrade for unlimited.`, 'error');
    const title = h('input', { class: 'input', value: 'My resume', 'aria-label': 'Resume name' });
    const job = h('input', { class: 'input', placeholder: 'Target job title (optional)' });
    const r = await modal({ title: 'New resume', body: h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', null, 'Name'), title), h('div', { class: 'field' }, h('label', null, 'Target role'), job), h('p', { class: 'hint' }, 'It starts as a copy of your master profile.')), actions: [{ label: 'Cancel', value: false }, { label: 'Create', value: true, class: 'btn-brand' }] });
    if (!r) return;
    try {
      const { resume } = await post('/resumes', { title: title.value, country: state.user.country, job: { title: job.value } });
      navigate('/app/resumes/' + resume.id);
    } catch (e) { toast(e.message, 'error'); }
  };

  const items = resumes.map((r) => h('a', { href: '/app/resumes/' + r.id, class: 'list-item' },
    h('div', { class: 'icon-badge' }, icon('file')),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'muted small' }, [r.jobTitle && `For ${r.jobTitle} · `, `${COUNTRIES[r.country]?.name || r.country} · edited ${ago(r.updatedAt)}`])),
    r.docId ? h('span', { class: `chip ${r.changedSinceCertified ? 'chip-warn' : 'chip-brand'}` }, icon('shield', 'icon-sm'), r.changedSinceCertified ? 'Edited since certified' : 'Certified') : h('span', { class: 'chip' }, 'Draft'),
    icon('arrow', 'icon-sm')));

  return h('div', null,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Resumes'), h('p', null, limit == null ? 'Unlimited resumes and versions.' : `${resumes.length} of ${limit} used on your ${state.user.plan.name} plan.`)), h('button', { class: 'btn btn-brand', onclick: create }, icon('plus'), 'New resume')),
    resumes.length ? h('div', { class: 'card', style: 'padding:8px 20px' }, h('div', { class: 'list' }, items))
      : h('div', { class: 'card empty' }, h('div', { class: 'icon-badge' }, icon('file')), h('h3', null, 'No resumes yet'), h('p', null, 'Create one from your master profile, then tailor it to a job.'), h('button', { class: 'btn btn-brand', style: 'margin-top:16px', onclick: create }, icon('plus'), 'Create your first resume')));
}

/* ================= editor ================= */
export async function editor({ params }) {
  const { resume: r, changedSinceCertified: initialStale } = await get('/resumes/' + params.id);
  let { content, job } = r;
  let template = r.template;
  let country = r.country;
  let title = r.title;
  const cert = { docId: r.docId, hash: r.certifiedHash, at: r.certifiedAt };
  let changedSinceCertified = !!initialStale;
  let undo = null;

  const indicator = h('span', { class: 'save-state' });
  const save = saver(async () => {
    const out = await put('/resumes/' + r.id, { title, template, country, content, job });
    changedSinceCertified = out.changedSinceCertified;
    drawVerify();
    drawPreview();
  }, indicator);
  onLeave(() => save.flush());

  /* ---- preview ---- */
  const previewHost = h('div', { class: 'paper-wrap' });
  const verifyUrl = () => `${location.origin}${location.pathname}#/verify/${cert.docId}`;
  const drawPreview = () => {
    const paper = renderPaper({ content, template, country, docId: cert.docId, verifyUrl: cert.docId ? verifyUrl() : '', stale: changedSinceCertified === true });
    clear(previewHost).append(paper);
  };
  const lightPreview = debounce(drawPreview, 120);
  const change = () => { lightPreview(); save(); };

  /* ---- tabs ---- */
  const tabs = ['Content', 'Job & AI', 'Design', 'Certify'];
  let active = 0;
  const tabBar = h('div', { class: 'tabs', role: 'tablist' });
  const panels = tabs.map(() => h('div', { role: 'tabpanel' }));
  const showTab = (i) => {
    active = i;
    tabBar.querySelectorAll('.tab').forEach((t, j) => { t.setAttribute('aria-selected', j === i); t.tabIndex = j === i ? 0 : -1; });
    panels.forEach((p, j) => (p.hidden = j !== i));
  };
  tabs.forEach((t, i) => tabBar.append(h('button', { type: 'button', role: 'tab', class: 'tab', onclick: () => showTab(i), onkeydown: (e) => { if (e.key === 'ArrowRight') { showTab((i + 1) % tabs.length); tabBar.children[(i + 1) % tabs.length].focus(); } if (e.key === 'ArrowLeft') { showTab((i + tabs.length - 1) % tabs.length); tabBar.children[(i + tabs.length - 1) % tabs.length].focus(); } } }, t)));

  /* ---- AI hooks ---- */
  const ai = {
    summary: async () => post('/ai/summary', { content, job: job.description ? job : null }),
    bullets: async (e) => post('/ai/bullets', { bullets: e.bullets, role: e.role, company: e.company, job: job.description ? job : null }),
  };

  /* ---- panel 0: content ---- */
  panels[0].append(contentForm(content, change, { country, ai }));

  /* ---- panel 1: job & AI ---- */
  const jobTitle = h('input', { class: 'input', value: job.title, placeholder: 'e.g. Senior Data Analyst' });
  const jobCo = h('input', { class: 'input', value: job.company, placeholder: 'Company' });
  const jobDesc = h('textarea', { class: 'textarea', rows: 10, placeholder: 'Paste the full job description here.' });
  jobDesc.value = job.description;
  const syncJob = () => { job = { title: jobTitle.value, company: jobCo.value, description: jobDesc.value }; save(); };
  [jobTitle, jobCo, jobDesc].forEach((el) => el.addEventListener('input', syncJob));
  const needJob = () => {
    if (jobDesc.value.trim().length < 40) { toast('Paste the job description first.', 'error'); jobDesc.focus(); return false; }
    return true;
  };
  const results = h('div', { class: 'stack', style: 'margin-top:8px' });

  const tailorBtn = h('button', { class: 'btn btn-brand', onclick: async () => {
    if (!needJob()) return;
    if (!(await confirmDialog('Tailor this resume?', 'AI will rewrite your summary and bullets for this job and reorder your skills. You can undo it afterwards. It never adds experience you do not have.', 'Tailor resume'))) return;
    setBusy(tailorBtn, true, 'Tailoring…');
    try {
      syncJob();
      await save.flush();
      const out = await post('/ai/tailor', { content, job, country });
      undo = JSON.parse(JSON.stringify(content));
      Object.assign(content, out.content);
      rebuildContent();
      change();
      state.user.plan = out.plan;
      clear(results).append(
        h('div', { class: `alert ${out.mode === 'ai' ? 'alert-info' : 'alert-warn'}` }, icon('sparkles'), h('div', null, h('strong', null, out.mode === 'ai' ? 'Resume tailored.' : 'Basic tailoring applied.'), out.notes.length > 0 && h('ul', { style: 'margin:6px 0 0 18px' }, out.notes.map((n) => h('li', null, n))))),
        h('button', { class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: () => { Object.assign(content, undo); undo = null; rebuildContent(); change(); clear(results); toast('Reverted to your previous version.'); } }, 'Undo tailoring'));
    } catch (e) { handleAiError(e); }
    setBusy(tailorBtn, false);
    tailorBtn.prepend(icon('sparkles'));
  } }, icon('sparkles'), 'Tailor resume to this job');

  const atsBtn = h('button', { class: 'btn btn-outline', onclick: async () => {
    if (!needJob()) return;
    setBusy(atsBtn, true, 'Scanning…');
    try {
      syncJob();
      const out = await post('/ai/ats', { content, job });
      clear(results).append(atsResultView(out));
    } catch (e) { handleAiError(e); }
    setBusy(atsBtn, false);
    atsBtn.prepend(icon('scan'));
  } }, icon('scan'), 'Scan for ATS match');

  panels[1].append(h('div', { class: 'stack' },
    h('p', { class: 'muted' }, 'Paste the job you are applying for. AI tailors your wording to it, and the scanner shows which keywords you are missing.'),
    h('div', { class: 'form-grid' }, h('div', { class: 'field' }, h('label', null, 'Job title'), jobTitle), h('div', { class: 'field' }, h('label', null, 'Company'), jobCo), h('div', { class: 'field span-2' }, h('label', null, 'Job description'), jobDesc)),
    h('div', { class: 'row row-wrap' }, tailorBtn, atsBtn), results,
    !state.config.ai && h('div', { class: 'alert alert-warn' }, icon('alert'), 'AI is running in basic mode on this server (no API key configured). Tailoring does light clean-up only.')));

  /* ---- panel 2: design ---- */
  const tplBtns = TEMPLATES.map((t) => h('button', { type: 'button', class: `tpl t-${t.id}`, 'aria-pressed': t.id === template, onclick: () => { template = t.id; tplBtns.forEach((b, i) => b.setAttribute('aria-pressed', TEMPLATES[i].id === template)); change(); } },
    h('div', { class: 'thumb' }, h('i', { class: 'h' }), h('i', { class: 'a' }), h('i'), h('i'), h('i', { style: 'width:70%' }), h('i', { class: 'a', style: 'margin-top:6px' }), h('i'), h('i', { style: 'width:80%' })), h('strong', null, t.name), h('div', { class: 'muted small' }, `ATS: ${t.ats}`)));
  const countrySel = h('select', { class: 'select', 'aria-label': 'Country format', onchange: () => { country = countrySel.value; showNote(); change(); rebuildContent(); } }, Object.values(COUNTRIES).map((c) => h('option', { value: c.id, selected: c.id === country }, `${c.name} (${c.doc})`)));
  const note = h('p', { class: 'hint' });
  const showNote = () => (note.textContent = `${COUNTRIES[country].note} Paper: ${COUNTRIES[country].paper}.`);
  showNote();
  panels[2].append(h('div', { class: 'stack' }, h('div', { class: 'field' }, h('label', null, 'Template'), h('div', { class: 'grid grid-4', style: 'grid-template-columns:repeat(auto-fill,minmax(130px,1fr))' }, tplBtns)), h('div', { class: 'field' }, h('label', null, 'Country format'), countrySel, note)));

  /* ---- panel 3: certify ---- */
  const verifyHost = h('div', { class: 'stack' });
  panels[3].append(verifyHost);
  function drawVerify() {
    const stale = changedSinceCertified === true;
    clear(verifyHost);
    verifyHost.append(h('p', { class: 'muted' }, 'Certifying gives this resume a unique document ID and a public page where recruiters can confirm it is genuine and unaltered. If you edit it later, you can re-certify the same ID.'));
    if (!cert.docId) {
      verifyHost.append(h('button', { class: 'btn btn-brand', style: 'align-self:flex-start', onclick: certify }, icon('shield'), 'Certify this resume'));
      return;
    }
    verifyHost.append(
      h('div', { class: 'card', style: 'padding:20px' },
        h('div', { class: 'row spread row-wrap' }, h('div', null, h('div', { class: 'label' }, 'Document ID'), h('div', { class: 'doc-id' }, cert.docId)), h('span', { class: `chip ${stale ? 'chip-warn' : 'chip-brand'}` }, icon(stale ? 'alert' : 'shield', 'icon-sm'), stale ? 'Edited since certified' : 'Certified')),
        h('p', { class: 'muted small', style: 'margin:10px 0 14px' }, stale ? 'Your changes are not covered by this ID yet. The ID will not appear on exports until you re-certify.' : `Certified ${fmtDate(cert.at)}. Exports include this ID.`),
        h('div', { class: 'row row-wrap' },
          stale && h('button', { class: 'btn btn-brand btn-sm', onclick: certify }, 'Re-certify now'),
          h('button', { class: 'btn btn-outline btn-sm', onclick: () => copyText(verifyUrl()) }, icon('link', 'icon-sm'), 'Copy verification link'),
          h('a', { class: 'btn btn-outline btn-sm', href: '/verify/' + cert.docId, target: '_blank', rel: 'noopener' }, 'Open public page'),
          h('button', { class: 'btn btn-danger btn-sm', onclick: revoke }, 'Revoke'))));
  }
  async function certify() {
    try {
      await save.flush();
      const out = await post(`/resumes/${r.id}/certify`);
      cert.docId = out.resume.docId; cert.hash = out.resume.certifiedHash; cert.at = out.resume.certifiedAt;
      changedSinceCertified = false;
      drawVerify(); drawPreview();
      toast(out.unchanged ? 'Already certified. Nothing has changed.' : 'Certified. Your document ID is ready.');
    } catch (e) { toast(e.message, 'error'); }
  }
  async function revoke() {
    if (!(await confirmDialog('Revoke this document ID?', 'Anyone who checks this ID will see it has been revoked. You can certify again afterwards, which creates a new ID.', 'Revoke', true))) return;
    try {
      await post(`/resumes/${r.id}/revoke`);
      cert.docId = null; cert.hash = null; cert.at = null;
      changedSinceCertified = false;
      drawVerify(); drawPreview();
      toast('Document ID revoked. Certify again to get a new ID.');
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---- rebuild content panel after AI replaced the data ---- */
  function rebuildContent() {
    clear(panels[0]).append(contentForm(content, change, { country, ai }));
  }

  /* ---- header ---- */
  const titleInput = h('input', { class: 'input', value: title, 'aria-label': 'Resume name', style: 'font-weight:600;font-size:18px;border-color:transparent;background:transparent;padding-left:0;max-width:420px', oninput: () => { title = titleInput.value; save(); } });
  const dl = h('button', { class: 'btn btn-outline', onclick: async () => {
    setBusy(dl, true, 'Preparing…');
    try { await save.flush(); await download(`/resumes/${r.id}/export`, 'resume.docx'); } catch (e) { toast(e.message, 'error'); }
    setBusy(dl, false);
    dl.prepend(icon('download'));
  } }, icon('download'), 'Word (.docx)');
  const pr = h('button', { class: 'btn btn-outline', onclick: async () => { await save.flush(); drawPreview(); window.print(); } }, icon('printer'), 'PDF / Print');

  drawPreview();
  drawVerify();
  showTab(0);

  return h('div', null,
    h('div', { class: 'page-head', style: 'margin-bottom:16px' },
      h('div', null, h('a', { href: '/app/resumes', class: 'muted small' }, '← All resumes'), titleInput),
      h('div', { class: 'row row-wrap' }, indicator, dl, pr)),
    h('div', { class: 'editor' },
      h('div', null, tabBar, panels),
      h('div', { class: 'preview-col' }, h('div', { class: 'preview-head row spread', style: 'margin-bottom:10px' }, h('strong', null, 'Live preview'), h('span', { class: 'muted small' }, `${COUNTRIES[country].doc} · ${COUNTRIES[country].paper}`)), previewHost, h('p', { class: 'hint no-print', style: 'margin-top:8px' }, 'Tip: in the print dialog choose “Save as PDF” and turn off headers and footers.'))));
}
