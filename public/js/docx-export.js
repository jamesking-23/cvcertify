import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, TabStopType, ExternalHyperlink, Table, TableRow, TableCell, WidthType, ShadingType } from 'https://esm.sh/docx@9.5.0';
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
  let tabPos = 10300;
  const row = (left, right) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: tabPos }],
      spacing: { before: 100, after: 20 },
      children: [run(left, { bold: true }), run(`\t${right || ''}`, { color: '555555' })],
    });

  const W = 10300; // usable width in twentieths of a point on A4 / Letter with these margins
  const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE };
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '8A93A6' };
  const allThin = { top: thin, bottom: thin, left: thin, right: thin };
  const cell = (children, width, o = {}) => new TableCell({ width: { size: width, type: WidthType.DXA }, borders: noBorders, margins: { top: 40, bottom: 40, left: 100, right: 100 }, children: children.length ? children : [new Paragraph({ children: [] })], ...o });
  const table = (rows, widths, o = {}) => new Table({ width: { size: widths.reduce((x, y) => x + y, 0), type: WidthType.DXA }, columnWidths: widths, borders: { ...noBorders, insideHorizontal: NONE, insideVertical: NONE }, rows, ...o });
  const small = (t, o = {}) => new Paragraph({ spacing: { after: 40 }, children: [run(t, { size: size - 1, ...o })] });

  // Section content as paragraph lists, so each layout can arrange the same material differently.
  const exp = (e, withDates = true) => [
    withDates ? row(`${e.role}${e.company ? ', ' + e.company : ''}`, dateRange(e)) : new Paragraph({ spacing: { before: 100, after: 20 }, children: [run(`${e.role}${e.company ? ', ' + e.company : ''}`, { bold: true })] }),
    ...(withDates || !dateRange(e) ? [] : [small(dateRange(e), { color: '555555' })]),
    ...(e.location ? [para(e.location, { spacing: { after: 20 } })] : []),
    ...(e.bullets || []).map(bullet),
  ];
  const proj = (e, withTech = true) => [withTech ? row(e.name, e.tech || '') : new Paragraph({ spacing: { before: 100, after: 20 }, children: [run(e.name, { bold: true })] }), ...(!withTech && e.tech ? [small(e.tech, { color: '555555' })] : []), ...(e.description ? [para(e.description)] : [])];
  const edu = (e, withDates = true) => [
    withDates ? row(`${e.degree}${e.field ? ' in ' + e.field : ''}${e.school ? ', ' + e.school : ''}`, dateRange(e)) : new Paragraph({ spacing: { before: 100, after: 20 }, children: [run(`${e.degree}${e.field ? ' in ' + e.field : ''}${e.school ? ', ' + e.school : ''}`, { bold: true })] }),
    ...(!withDates && dateRange(e) ? [small(dateRange(e), { color: '555555' })] : []),
    ...(e.details ? [para(e.details)] : []),
  ];
  const certLine = (e) => `${e.name}${e.issuer ? ' – ' + e.issuer : ''}${e.year ? ' (' + e.year + ')' : ''}`;
  const langLine = (l) => `${l.name}${l.level ? ' (' + l.level + ')' : ''}`;
  const refLines = (r) => [`${r.name}${r.title ? ', ' + r.title : ''}`, ...(r.contact ? [r.contact] : [])];

  const body = [];
  const centred = ['classic', 'executive', 'academic'].includes(template);
  const align = centred ? AlignmentType.CENTER : AlignmentType.LEFT;
  const contactList = [p.email, p.phone, p.location, p.website, p.linkedin, p.github].filter(Boolean);
  const personalList = [rules.dob && p.dob ? `Date of birth: ${p.dob}` : '', rules.nationality && p.nationality ? `Nationality: ${p.nationality}` : ''].filter(Boolean);
  const showReferees = rules.referees && c.referees?.length;

  if (template === 'rail') {
    // Name across the top, then a shaded side rail (contact, skills, languages...) beside the main story.
    body.push(new Paragraph({ spacing: { after: 40 }, children: [run(p.fullName || 'Your Name', { bold: true, size: 44, color: st.head })] }));
    if (p.headline) body.push(new Paragraph({ spacing: { after: 120 }, children: [run(p.headline, { color: st.accent, size: size + 2 })] }));
    const railHead = (t) => new Paragraph({ spacing: { before: 160, after: 60 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: st.accent, space: 1 } }, children: [run(t.toUpperCase(), { bold: true, color: st.accent, size: size - 1, characterSpacing: 20 })] });
    const rail = [];
    if (contactList.length || personalList.length) rail.push(railHead('Contact'), ...[...contactList, ...personalList].map((t) => small(t)));
    if (c.skills?.length) rail.push(railHead('Skills'), ...c.skills.map((t) => small(t)));
    if (c.languages?.length) rail.push(railHead('Languages'), ...c.languages.map((l) => small(langLine(l))));
    if (c.certifications?.length) rail.push(railHead('Certifications'), ...c.certifications.map((e) => small(certLine(e))));
    if (showReferees) rail.push(railHead('Referees'), ...c.referees.flatMap((r) => refLines(r).map((t, i) => small(t, i === 0 ? { bold: true } : {}))));
    tabPos = 7000; // right-aligned dates sit at the edge of the narrower main column
    const main = [];
    if (c.summary) main.push(heading('Profile'), para(c.summary));
    if (c.experience?.length) main.push(heading('Experience'), ...c.experience.flatMap((e) => exp(e)));
    if (c.projects?.length) main.push(heading('Projects'), ...c.projects.flatMap((e) => proj(e)));
    if (c.education?.length) main.push(heading('Education'), ...c.education.flatMap((e) => edu(e)));
    // The main column is narrower, so right-aligned dates use a tab stop inside it.
    body.push(table([new TableRow({ children: [cell(rail, 3000, { shading: { type: ShadingType.CLEAR, fill: 'EEF4F1', color: 'auto' }, margins: { top: 80, bottom: 80, left: 160, right: 160 } }), cell(main, W - 3000, { margins: { top: 0, bottom: 40, left: 240, right: 40 } })] })], [3000, W - 3000]));
  } else {
    if (template === 'academic') {
      // Shaded header band, like the on-screen layout.
      const band = (t, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, shading: { type: ShadingType.CLEAR, fill: 'E8EDF6', color: 'auto' }, ...o, children: [t] });
      body.push(band(run(p.fullName || 'Your Name', { bold: true, size: 40, color: st.head }), { spacing: { before: 0, after: 0 } }));
      if (p.headline) body.push(band(run(p.headline, { color: st.accent, size: size + 2 }), { spacing: { after: 0 } }));
      if (contactList.length) body.push(band(run(contactList.join('  |  '), { size: size - 1 }), { spacing: { after: 60 } }));
    } else {
      body.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [run(p.fullName || 'Your Name', { bold: true, size: 40, color: st.head })] }));
      if (p.headline) body.push(new Paragraph({ alignment: align, spacing: { after: 40 }, children: [run(p.headline, { color: st.accent, size: size + 2 })] }));
      if (contactList.length) body.push(new Paragraph({ alignment: align, spacing: { after: 80 }, children: [run(contactList.join('  |  '), { size: size - 1 })] }));
    }
    if (personalList.length) body.push(new Paragraph({ alignment: align, spacing: { after: 80 }, children: [run(personalList.join('  |  '), { size: size - 1 })] }));

    if (c.summary) body.push(heading('Profile'), para(c.summary));

    if (template === 'timeline') {
      // Dates in a left margin, details on the right.
      const DW = 1900;
      const timeRows = (items, dateOf, detail) => table(items.map((e) => new TableRow({ cantSplit: true, children: [cell([new Paragraph({ spacing: { before: 100 }, children: [run(dateOf(e), { color: st.accent, size: size - 1, bold: true })] })], DW), cell(detail(e), W - DW)] })), [DW, W - DW]);
      if (c.experience?.length) body.push(heading('Experience'), timeRows(c.experience, dateRange, (e) => exp(e, false).filter((_, i) => !(i === 1 && dateRange(e)))));
      if (c.projects?.length) body.push(heading('Projects'), timeRows(c.projects, () => '', (e) => proj(e, false)));
      if (c.education?.length) body.push(heading('Education'), timeRows(c.education, dateRange, (e) => edu(e, false).filter((_, i) => !(i === 1 && dateRange(e)))));
    } else if (template === 'academic') {
      const grid = (head, rows, widths) => table([
        new TableRow({ tableHeader: true, children: head.map((t, i) => cell([small(t, { bold: true })], widths[i], { borders: allThin, shading: { type: ShadingType.CLEAR, fill: 'E8EDF6', color: 'auto' } })) }),
        ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell([small(t)], widths[i], { borders: allThin })) })),
      ], widths);
      if (c.education?.length) body.push(heading('Education and qualifications'), grid(['Qualification', 'Institution', 'Period'], c.education.map((e) => [`${e.degree}${e.field ? ' in ' + e.field : ''}${e.details ? ' – ' + e.details : ''}`, e.school || '', dateRange(e)]), [4700, 3600, 2000]));
      if (c.experience?.length) body.push(heading('Experience'), ...c.experience.flatMap((e) => exp(e)));
      if (c.projects?.length) body.push(heading('Projects'), ...c.projects.flatMap((e) => proj(e)));
      if (c.certifications?.length) body.push(heading('Certifications'), grid(['Certificate', 'Awarded by', 'Year'], c.certifications.map((e) => [e.name, e.issuer || '', e.year || '']), [4700, 3600, 2000]));
    } else {
      if (c.experience?.length) body.push(heading('Experience'), ...c.experience.flatMap((e) => exp(e)));
      if (c.projects?.length) body.push(heading('Projects'), ...c.projects.flatMap((e) => proj(e)));
      if (c.education?.length) body.push(heading('Education'), ...c.education.flatMap((e) => edu(e)));
    }
    if (c.skills?.length) body.push(heading('Skills'), para(c.skills.join(', ')));
    if (c.certifications?.length && template !== 'academic') body.push(heading('Certifications'), ...c.certifications.map((e) => bullet(certLine(e))));
    if (c.languages?.length) body.push(heading('Languages'), para(c.languages.map(langLine).join(', ')));
    if (showReferees) {
      body.push(heading('Referees'));
      for (const r of c.referees) body.push(para(`${r.name}${r.title ? ', ' + r.title : ''}${r.contact ? ' – ' + r.contact : ''}`));
    }
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
