import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ExternalHyperlink } from 'https://esm.sh/docx@9.5.0';
import { COUNTRIES, dateRange } from './shared/constants.js';

const STYLES = {
  classic: { font: 'Georgia', accent: '000000', head: '000000' },
  modern: { font: 'Calibri', accent: '178055', head: '178055' },
  compact: { font: 'Arial', accent: '363F52', head: '363F52' },
  executive: { font: 'Cambria', accent: 'A67C2E', head: '171D28' },
  academic: { font: 'Times New Roman', accent: '1F3A6E', head: '000000' },
  timeline: { font: 'Calibri', accent: 'B4532A', head: '1D1A16' },
  rail: { font: 'Arial', accent: '14624A', head: '10151D' },
};

export async function resumeToDocx({ content, template, country, docId, verifyUrl }) {
  const st = STYLES[template] || STYLES.classic;
  const c = content;
  const p = c.personal || {};
  const rules = COUNTRIES[country] || COUNTRIES.US;
  const size = template === 'compact' ? 19 : 21;
  const run = (text, o = {}) => new TextRun({ text, font: st.font, size, ...o });

  const heading = (t) =>
    new Paragraph({
      spacing: { before: 220, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: st.accent, space: 2 } },
      children: [run(t.toUpperCase(), { bold: true, color: st.head, size: size + 1, characterSpacing: 20 })],
    });
  const para = (text, o = {}) => new Paragraph({ spacing: { after: 60 }, ...o, children: [run(text)] });
  const bullet = (t) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [run(t)] });
  const row = (left, right) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: 10300 }],
      spacing: { before: 100, after: 20 },
      children: [run(left, { bold: true }), run(`\t${right || ''}`, { color: '555555' })],
    });

  const body = [];
  const align = ['classic', 'executive', 'academic'].includes(template) ? AlignmentType.CENTER : AlignmentType.LEFT;
  body.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [run(p.fullName || 'Your Name', { bold: true, size: 40, color: st.head })] }));
  if (p.headline) body.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [run(p.headline, { color: st.accent, size: size + 2 })] }));
  const contact = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean).join('  |  ');
  if (contact) body.push(new Paragraph({ alignment: align, spacing: { after: 80 }, children: [run(contact, { size: size - 1 })] }));
  const personal = [rules.dob && p.dob ? `Date of birth: ${p.dob}` : '', rules.nationality && p.nationality ? `Nationality: ${p.nationality}` : ''].filter(Boolean).join('  |  ');
  if (personal) body.push(new Paragraph({ alignment: align, spacing: { after: 80 }, children: [run(personal, { size: size - 1 })] }));

  if (c.summary) {
    body.push(heading('Profile'), para(c.summary));
  }
  if (c.experience?.length) {
    body.push(heading('Experience'));
    for (const e of c.experience) {
      body.push(row(`${e.role}${e.company ? ', ' + e.company : ''}`, dateRange(e)));
      if (e.location) body.push(para(e.location, { spacing: { after: 20 } }));
      for (const b of e.bullets || []) body.push(bullet(b));
    }
  }
  if (c.projects?.length) {
    body.push(heading('Projects'));
    for (const e of c.projects) {
      body.push(row(e.name, e.tech || ''));
      if (e.description) body.push(para(e.description));
    }
  }
  if (c.education?.length) {
    body.push(heading('Education'));
    for (const e of c.education) {
      body.push(row(`${e.degree}${e.field ? ' in ' + e.field : ''}${e.school ? ', ' + e.school : ''}`, dateRange(e)));
      if (e.details) body.push(para(e.details));
    }
  }
  if (c.skills?.length) body.push(heading('Skills'), para(c.skills.join(', ')));
  if (c.certifications?.length) {
    body.push(heading('Certifications'));
    for (const e of c.certifications) body.push(bullet(`${e.name}${e.issuer ? ' – ' + e.issuer : ''}${e.year ? ' (' + e.year + ')' : ''}`));
  }
  if (c.languages?.length) body.push(heading('Languages'), para(c.languages.map((l) => `${l.name}${l.level ? ' (' + l.level + ')' : ''}`).join(', ')));
  if (rules.referees && c.referees?.length) {
    body.push(heading('Referees'));
    for (const r of c.referees) body.push(para(`${r.name}${r.title ? ', ' + r.title : ''}${r.contact ? ' – ' + r.contact : ''}`));
  }

  if (docId) {
    body.push(
      new Paragraph({
        spacing: { before: 300 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD1DD', space: 6 } },
        children: [
          run('Verified by CV-Certify · Document ID ', { size: 16, color: '6B7488' }),
          run(docId, { size: 16, bold: true, color: '178055' }),
          run(' · Verify at ', { size: 16, color: '6B7488' }),
          new ExternalHyperlink({ link: verifyUrl, children: [run(verifyUrl.replace(/^https?:\/\//, ''), { size: 16, color: '178055' })] }),
        ],
      }),
    );
  }

  const A4 = { width: 11906, height: 16838 };
  const LETTER = { width: 12240, height: 15840 };
  const doc = new Document({
    creator: 'CV-Certify',
    title: `${p.fullName || 'Resume'} – ${rules.doc}`,
    sections: [{ properties: { page: { size: rules.paper === 'Letter' ? LETTER : A4, margin: { top: 720, bottom: 720, left: 800, right: 800 } } }, children: body }],
  });
  return Packer.toBlob(doc);
}

import { letterParts } from './preview.js';

// Word version of the cover letter, laid out like the on-screen format.
export async function letterToDocx({ text, name, personal = {}, job = {}, format = 'formal' }) {
  const L = letterParts({ text, personal, job });
  const font = format === 'right' ? 'Times New Roman' : 'Calibri';
  const run = (t, o = {}) => new TextRun({ text: t, font, size: 23, ...o });
  const para = (t, o = {}, r = {}) => new Paragraph({ spacing: { after: 160, line: 300 }, ...o, children: [run(t, r)] });
  const lines = (arr, o = {}, r = {}) => arr.map((t) => new Paragraph({ spacing: { after: 0, line: 300 }, ...o, children: [run(t, r)] }));
  const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });
  const recipient = (label) => [...(label ? [new Paragraph({ spacing: { after: 0 }, children: [run(label)] })] : []), ...L.recipient.map((r, i) => new Paragraph({ spacing: { after: 0, line: 300 }, children: [run(r, { bold: i > 0 && L.recipient.length > 1 })] })), gap()];
  const subject = L.subject ? [para(L.subject, {}, { bold: true })] : [];
  const body = [para(L.salutation), ...L.paragraphs.flatMap((t) => para(t)), para(L.closing, { spacing: { after: 700 } }), new Paragraph({ children: [run(L.name)] })];
  let head;
  if (format === 'right') head = [...lines([L.name], { alignment: AlignmentType.RIGHT }, { bold: true }), ...lines([...L.sender].reverse(), { alignment: AlignmentType.RIGHT }), ...lines([L.date], { alignment: AlignmentType.RIGHT }), gap(), ...recipient('To:')];
  else if (format === 'letterhead') head = [new Paragraph({ spacing: { after: 40 }, children: [run(L.name, { bold: true, size: 40, color: '10151D' })] }), new Paragraph({ spacing: { after: 280 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '178055', space: 6 } }, children: [run(L.sender.join('  ·  '), { color: '555555', size: 20 })] }), para(L.date), ...recipient('')];
  else head = [...lines([L.name, ...L.sender, L.date]), gap(), ...recipient('')];
  const doc = new Document({ creator: 'CV-Certify', title: `${name || 'Cover letter'}`, sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1300, right: 1300 } } }, children: [...head, ...subject, ...body] }] });
  return Packer.toBlob(doc);
}
