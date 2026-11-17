import { h, icon, clear, setBusy, fmtDate, setTitle } from '../ui.js';
import { get } from '../api.js';
import { navigate } from '../main.js';
import { formatMonth } from '../shared/constants.js';

const range = (e) => [formatMonth(e.start), e.current ? 'Present' : formatMonth(e.end)].filter(Boolean).join(' – ');

function resultView(d) {
  const ok = d.status === 'valid';
  return h('div', { class: 'stack' },
    h('div', { class: `verify-result ${ok ? 'valid' : 'revoked'}`, role: 'status' },
      h('div', { class: 'row', style: 'align-items:flex-start;gap:16px' },
        h('div', { class: 'icon-badge', style: `width:48px;height:48px;border-radius:14px;${ok ? 'background:var(--brand-600);color:#fff' : 'background:var(--red-600);color:#fff'}` }, icon(ok ? 'shield' : 'alert', 'icon-lg')),
        h('div', { class: 'grow' },
          h('h2', { style: 'font-size:24px' }, ok ? 'Valid CV-Certify document' : 'This document has been revoked'),
          h('p', { class: 'muted', style: 'margin-top:4px' }, ok ? `Issued to ${d.holder}${d.headline ? ', ' + d.headline : ''}.` : d.revokedReason || 'The holder has withdrawn this document.'),
          h('div', { class: 'doc-id', style: 'margin-top:12px' }, d.id),
          h('div', { class: 'muted small', style: 'margin-top:6px' }, `First issued ${fmtDate(d.issuedAt)} · last certified ${fmtDate(d.updatedAt)}${d.revisions > 1 ? ` · ${d.revisions} versions` : ''}`)))),
    ok && d.snapshot && h('div', { class: 'card stack' },
      h('h3', null, 'What the holder certified'),
      d.snapshot.summary && h('p', { class: 'muted' }, d.snapshot.summary),
      d.snapshot.experience?.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:6px' }, 'Experience'), d.snapshot.experience.map((e) => h('div', { class: 'row spread', style: 'padding:6px 0;border-bottom:1px solid var(--ink-100)' }, h('span', null, h('strong', null, e.role), e.company ? ` · ${e.company}` : ''), h('span', { class: 'muted small' }, range(e))))),
      d.snapshot.education?.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:6px' }, 'Education'), d.snapshot.education.map((e) => h('div', { style: 'padding:6px 0;border-bottom:1px solid var(--ink-100)' }, h('strong', null, [e.degree, e.field].filter(Boolean).join(' in ')), e.school ? ` · ${e.school}` : ''))),
      d.snapshot.certifications?.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:6px' }, 'Certifications'), d.snapshot.certifications.map((e) => h('div', { style: 'padding:4px 0' }, `${e.name}${e.issuer ? ' · ' + e.issuer : ''}${e.year ? ' (' + e.year + ')' : ''}`))),
      d.snapshot.skills?.length > 0 && h('div', null, h('div', { class: 'label', style: 'margin-bottom:6px' }, 'Skills'), h('div', { class: 'kw' }, d.snapshot.skills.map((s) => h('span', { class: 'chip' }, s))))),
    h('p', { class: 'hint' }, d.note));
}

export default function verifyPage({ params }) {
  const input = h('input', { class: 'input mono', placeholder: 'CVC-XXXX-XXXX-XXXX', value: params.id || '', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Document ID', style: 'height:48px;font-size:16px' });
  const out = h('div', { style: 'margin-top:28px' });
  const btn = h('button', { class: 'btn btn-primary', style: 'height:48px', type: 'submit' }, icon('search'), 'Verify');

  const check = async (id) => {
    clear(out);
    if (!id.trim()) return;
    setBusy(btn, true, 'Checking…');
    try {
      const d = await get('/verify/' + encodeURIComponent(id.trim()));
      out.append(resultView(d));
      setTitle(d.status === 'valid' ? `Verified: ${d.holder}` : 'Revoked document');
    } catch (e) {
      out.append(h('div', { class: 'verify-result revoked', role: 'alert' }, h('div', { class: 'row' }, icon('alert', 'icon-lg'), h('div', null, h('strong', null, e.status === 404 ? 'Document not found' : 'Could not check'), h('p', { class: 'small', style: 'margin-top:2px' }, e.message)))));
    }
    setBusy(btn, false);
    btn.prepend(icon('search'));
  };

  const form = h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); const v = input.value.trim(); history.replaceState({}, '', v ? '/verify/' + encodeURIComponent(v) : '/verify'); check(v); } }, h('div', { class: 'grow' }, input), btn);
  if (params.id) queueMicrotask(() => check(params.id));

  return h('div', { class: 'container container-sm section', style: 'max-width:760px' },
    h('div', { class: 'eyebrow' }, 'For recruiters'),
    h('h1', { style: 'font-size:clamp(28px,4vw,40px);margin:8px 0 12px' }, 'Verify a CV-Certify document'),
    h('p', { class: 'muted', style: 'margin-bottom:24px;font-size:16px' }, 'Enter the document ID printed at the bottom of the resume. No account needed.'),
    form, out);
}
