import { h, icon, toast, modal, setBusy, clear } from './ui.js';
import { newId } from './util-client.js';
import { COUNTRIES, LANGUAGE_LEVELS } from './shared/constants.js';

export function handleAiError(e) {
  if (e.status === 402) {
    modal({ title: 'AI limit reached for this month', body: h('p', { class: 'muted' }, e.message), actions: [{ label: 'OK', value: true, class: 'btn-brand' }] });
  } else toast(e.message || 'Something went wrong.', 'error');
}

const field = (label, input, { span2 = false, hint } = {}) => h('div', { class: `field${span2 ? ' span-2' : ''}` }, h('label', null, label), input, hint && h('span', { class: 'hint' }, hint));

function bound(obj, key, change, props = {}, tag = 'input') {
  const el = h(tag, { class: tag === 'textarea' ? 'textarea' : 'input', ...props });
  el.value = obj[key] ?? '';
  el.addEventListener('input', () => { obj[key] = el.value; change(); });
  return el;
}

const monthInput = (obj, key, change) => bound(obj, key, change, { type: 'month' });

function section(title, bodyFn, { open = false, count } = {}) {
  return h('details', { class: 'section-card', open }, h('summary', null, h('span', null, title, count != null && h('span', { class: 'muted small', style: 'margin-left:8px;font-weight:400' }, count ? `(${count})` : '')), icon('chevDown', 'chev')), h('div', { class: 'body' }, bodyFn()));
}

function listEditor({ items, change, renderEntry, makeNew, addLabel, label }) {
  const host = h('div', { class: 'stack' });
  const draw = () => {
    clear(host);
    items.forEach((it, i) => {
      host.append(h('div', { class: 'entry' },
        h('div', { class: 'entry-head' }, h('span', null, `${label} ${i + 1}`), h('span', { class: 'row', style: 'gap:2px' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; change(); draw(); } }, icon('chevDown', 'icon-sm')),
          h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `Delete ${label.toLowerCase()} ${i + 1}`, onclick: () => { items.splice(i, 1); change(); draw(); } }, icon('trash', 'icon-sm')))),
        renderEntry(it, i, change)));
    });
    host.append(h('button', { type: 'button', class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: () => { items.push(makeNew()); change(); draw(); host.querySelector('.entry:last-of-type input')?.focus(); } }, icon('plus', 'icon-sm'), addLabel));
  };
  draw();
  return host;
}

function tagInput(list, change, placeholder) {
  const wrap = h('div', { class: 'tag-input' });
  const input = h('input', { placeholder, 'aria-label': placeholder });
  const draw = () => {
    wrap.querySelectorAll('.tag').forEach((t) => t.remove());
    list.forEach((s, i) => wrap.insertBefore(h('span', { class: 'tag' }, s, h('button', { type: 'button', 'aria-label': `Remove ${s}`, onclick: () => { list.splice(i, 1); change(); draw(); } }, icon('x', 'icon-sm'))), input));
  };
  const add = () => {
    for (const raw of input.value.split(',')) {
      const v = raw.trim();
      if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v.slice(0, 60));
    }
    input.value = '';
    change();
    draw();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); change(); draw(); }
  });
  input.addEventListener('blur', add);
  wrap.append(input);
  draw();
  return wrap;
}

/**
 * Builds the full content form. Mutates `c` in place and calls `change()` after every edit.
 * ai: { bullets(entry) -> Promise<string[]>, summary() -> Promise<string> } (optional)
 */
export function contentForm(c, change, { country = 'US', ai } = {}) {
  const rules = COUNTRIES[country] || COUNTRIES.US;
  const p = c.personal;

  const personal = () => h('div', { class: 'form-grid' },
    field('Full name', bound(p, 'fullName', change, { autocomplete: 'name' })),
    field('Professional headline', bound(p, 'headline', change, { placeholder: 'e.g. Operations Analyst' })),
    field('Email', bound(p, 'email', change, { type: 'email', autocomplete: 'email' })),
    field('Phone', bound(p, 'phone', change, { type: 'tel', autocomplete: 'tel' })),
    field('Location', bound(p, 'location', change, { placeholder: 'City, Country' })),
    field('Website / portfolio', bound(p, 'website', change, { placeholder: 'yourname.com' })),
    field('LinkedIn', bound(p, 'linkedin', change, { placeholder: 'linkedin.com/in/…' })),
    field('GitHub', bound(p, 'github', change, { placeholder: 'github.com/…' })),
    field('Registration or membership line', bound(p, 'registration', change, { placeholder: 'e.g. Student Member UIPE SM/11666 (optional)' }), { span2: true, hint: 'Shown under your contact details.' }),
    field('Date of birth', bound(p, 'dob', change, { type: 'date', min: '1930-01-01', max: new Date().toISOString().slice(0, 10), autocomplete: 'bday' })),
    field('Nationality', bound(p, 'nationality', change)),
    field('Note at the foot of the CV', bound(c, 'footnote', change, { placeholder: 'e.g. Copies of transcripts are available upon request. (optional)' }), { span2: true }),
    h('label', { class: 'check span-2', style: 'display:flex;gap:10px;align-items:center;cursor:pointer' },
      h('input', { type: 'checkbox', checked: !!c.options?.showPersonal, onchange: (ev) => { c.options = { ...(c.options || {}), showPersonal: ev.target.checked }; change(); } }),
      h('span', null, 'Show date of birth and nationality on this resume ', h('span', { class: 'hint' }, rules.dob || rules.nationality ? `(common in ${rules.name}, but optional)` : `(not usual in ${rules.name})`))));

  const summary = () => {
    const ta = bound(c, 'summary', change, { rows: 4, 'aria-label': 'Professional summary', placeholder: '2–4 sentences: who you are, what you do best, what you want next.' }, 'textarea');
    const btn = h('button', { type: 'button', class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: async () => {
      setBusy(btn, true, ['Reading your profile…', 'Writing options…', 'Polishing…']);
      try { showOptions(await ai.summary()); } catch (e) { handleAiError(e); }
      setBusy(btn, false);
      btn.prepend(icon('sparkles', 'icon-sm'));
    } }, icon('sparkles', 'icon-sm'), c.summary ? 'Suggest other summaries' : 'Suggest summaries');
    // Several different options per request, shown side by side so the person chooses (and edits) rather than accepting one.
    const panel = h('div', { class: 'suggest', hidden: true });
    const showOptions = (out) => {
      clear(panel).append(
        h('div', { class: 'suggest-head' }, h('b', null, `${out.options.length} options`), h('span', { class: 'muted small' }, 'Built from your profile and different on every request. Edit anything that is not true for you.')),
        ...out.options.map((o) => h('div', { class: 'suggest-card' }, h('div', { class: 'suggest-meta' }, h('span', { class: 'tag' }, o.label), h('span', { class: 'muted small' }, `${o.words || o.text.split(/\s+/).length} words`)), h('p', null, o.text),
          h('button', { type: 'button', class: 'btn btn-outline btn-sm', onclick: () => { ta.value = c.summary = o.text; change(); toast('Summary applied.'); } }, 'Use this'))),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => btn.click() }, icon('sparkles', 'icon-sm'), 'Show me different ones'));
      panel.hidden = false;
      panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    };
    return [ta, ai && btn, ai && panel];
  };

  const experience = () => listEditor({
    items: c.experience, change, label: 'Role', addLabel: 'Add experience',
    makeNew: () => ({ id: newId(), role: '', company: '', location: '', start: '', end: '', current: false, bullets: [] }),
    renderEntry: (e) => {
      const end = monthInput(e, 'end', change);
      end.disabled = e.current;
      const cur = h('input', { type: 'checkbox', checked: e.current, onchange: (ev) => { e.current = ev.target.checked; end.disabled = e.current; if (e.current) { e.end = ''; end.value = ''; } change(); } });
      const ta = h('textarea', { class: 'textarea', rows: 5, placeholder: 'One achievement per line.\nLed X, which improved Y by Z%.' });
      ta.value = (e.bullets || []).join('\n');
      ta.addEventListener('input', () => { e.bullets = ta.value.split('\n').map((l) => l.trim()).filter(Boolean); change(); });
      const btn = h('button', { type: 'button', class: 'btn btn-outline btn-sm', style: 'align-self:flex-start', onclick: async () => {
        if (!e.bullets.length) return toast('Write a rough bullet first, then let AI polish it.', 'error');
        setBusy(btn, true, ['Reading your bullets…', 'Rewriting…', 'Polishing…']);
        try {
          const out = await ai.bullets(e);
          variants = out.variants || out.bullets.map((b) => [b]);
          version = 0;
          apply();
          toast('Bullets rewritten. Check them for accuracy.');
        } catch (er) { handleAiError(er); }
        setBusy(btn, false);
        btn.prepend(icon('sparkles', 'icon-sm'));
      } }, icon('sparkles', 'icon-sm'), 'Improve bullets');
      // Each bullet comes back in up to three versions. Cycling is free and does not use your AI quota.
      let variants = null;
      let version = 0;
      const apply = () => { e.bullets = variants.map((v) => v[version % v.length]); ta.value = e.bullets.join('\n'); change(); another.hidden = !variants.some((v) => v.length > 1); };
      const another = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', hidden: true, onclick: () => { version++; apply(); } }, 'Show another version');
      return [
        h('div', { class: 'form-grid' }, field('Job title', bound(e, 'role', change)), field('Company', bound(e, 'company', change)), field('Location', bound(e, 'location', change)), h('div'), field('Start', monthInput(e, 'start', change)), field('End', end),
          h('label', { class: 'check span-2' }, cur, 'I currently work here')),
        field('Achievements', ta, { hint: 'Start with a strong verb. Add numbers where you honestly can.' }), ai && h('div', { class: 'row row-wrap' }, btn, another)];
    },
  });

  const education = () => listEditor({
    items: c.education, change, label: 'Education', addLabel: 'Add education',
    makeNew: () => ({ id: newId(), school: '', degree: '', field: '', start: '', end: '', details: '' }),
    renderEntry: (e) => h('div', { class: 'form-grid' }, field('School', bound(e, 'school', change)), field('Degree / qualification', bound(e, 'degree', change, { placeholder: 'BSc, Diploma, A-Levels…' })), field('Field of study', bound(e, 'field', change)), h('div'), field('Start', monthInput(e, 'start', change)), field('End', monthInput(e, 'end', change)), field('Details (optional)', bound(e, 'details', change, { placeholder: 'Honours, GPA, relevant modules' }), { span2: true })),
  });

  const projects = () => listEditor({
    items: c.projects, change, label: 'Project', addLabel: 'Add project',
    makeNew: () => ({ id: newId(), name: '', link: '', tech: '', description: '' }),
    renderEntry: (e) => h('div', { class: 'form-grid' }, field('Name', bound(e, 'name', change)), field('Tools / tech', bound(e, 'tech', change)), field('Description', bound(e, 'description', change, { rows: 3 }, 'textarea'), { span2: true })),
  });

  const skills = () => [tagInput(c.skills, change, 'Type a skill and press Enter'), h('p', { class: 'hint' }, 'List tools, methods and languages exactly as employers write them (e.g. “Microsoft Excel”, “Project management”).')];

  const certs = () => listEditor({
    items: c.certifications, change, label: 'Certification', addLabel: 'Add certification',
    makeNew: () => ({ id: newId(), name: '', issuer: '', year: '' }),
    renderEntry: (e) => h('div', { class: 'form-grid' }, field('Name', bound(e, 'name', change)), field('Issuer', bound(e, 'issuer', change)), field('Year', bound(e, 'year', change, { maxlength: 4, inputmode: 'numeric' }))),
  });

  const langs = () => listEditor({
    items: c.languages, change, label: 'Language', addLabel: 'Add language',
    makeNew: () => ({ id: newId(), name: '', level: 'Fluent' }),
    renderEntry: (e) => {
      const sel = h('select', { class: 'select', onchange: () => { e.level = sel.value; change(); } }, LANGUAGE_LEVELS.map((l) => h('option', { value: l, selected: l === e.level }, l)));
      return h('div', { class: 'form-grid' }, field('Language', bound(e, 'name', change)), field('Level', sel));
    },
  });

  const referees = () => [
    h('p', { class: 'hint' }, rules.referees ? `Referees appear on ${rules.name} formats.` : `Referees are not shown on ${rules.name} formats (“references available on request”). They are kept here in case you switch format.`),
    listEditor({
      items: c.referees, change, label: 'Referee', addLabel: 'Add referee',
      makeNew: () => ({ id: newId(), name: '', title: '', contact: '' }),
      renderEntry: (e) => h('div', { class: 'form-grid' }, field('Name', bound(e, 'name', change)), field('Position & organisation', bound(e, 'title', change)), field('Contact', bound(e, 'contact', change), { span2: true })),
    }),
  ];

  return h('div', null,
    section('Personal details', personal, { open: true }),
    section('Professional summary', summary, { open: true }),
    section('Work experience', experience, { open: true, count: c.experience.length }),
    section('Education', education, { count: c.education.length }),
    section('Skills', skills, { count: c.skills.length }),
    section('Projects', projects, { count: c.projects.length }),
    section('Certifications', certs, { count: c.certifications.length }),
    section('Languages', langs, { count: c.languages.length }),
    section('Referees', referees, { count: c.referees.length }));
}
