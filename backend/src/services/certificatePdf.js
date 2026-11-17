'use strict';
// A one-page participation certificate as a PDF (P9-09, FR-STU-006). Written by hand for the one layout we need, so there is
// no PDF library to keep up to date: standard Helvetica fonts, A4 landscape, text only. Characters outside Latin-1 (for
// example Devanagari names) cannot be drawn with a standard font and print as "?"; the certificate ID is what proves it.

const PAGE_W = 842; // A4 landscape in points
const PAGE_H = 595;

// Helvetica advance widths (1/1000 em) for the printable ASCII range 32..126, used to centre lines.
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Keeps what a standard font can draw (Latin-1), turns the rest into "?" and drops control characters. */
// eslint-disable-next-line no-control-regex -- control characters are exactly what is being removed
const latin1 = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[^\u0000-\u00ff]/g, '?');
const escapeText = (text) => latin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Width of a line in points. Bold is a little wider; characters beyond ASCII count as an average one. */
function textWidth(text, size, bold = false) {
  let units = 0;
  for (const ch of latin1(text)) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? W[code - 32] : 556;
  }
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

/** Cuts a line to fit [maxWidth], adding "..." when it had to. */
function fit(text, size, maxWidth, bold = false) {
  let t = latin1(text);
  if (textWidth(t, size, bold) <= maxWidth) return t;
  while (t.length > 1 && textWidth(`${t}...`, size, bold) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

const fmtDate = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

const fmtHours = (h) => {
  const n = Math.round((Number(h) || 0) * 100) / 100;
  return `${n} ${n === 1 ? 'hour' : 'hours'}`;
};

/**
 * @param {{ certNo: string, studentName: string, title: string, hours?: number, completedAt?: Date, issuedAt?: Date, supervisorName?: string }} c
 * @returns {Buffer} the PDF file
 */
function buildCertificatePdf(c) {
  const ops = [];
  const margin = 60;
  const inner = PAGE_W - margin * 2;
  const centred = (text, y, size, { bold = false, gray = 0 } = {}) => {
    const t = fit(text, size, inner - 20, bold);
    const x = (PAGE_W - textWidth(t, size, bold)) / 2;
    ops.push(`${gray} g BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y} Td (${escapeText(t)}) Tj ET`);
  };
  const at = (text, x, y, size, { bold = false, gray = 0 } = {}) => ops.push(`${gray} g BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapeText(text)}) Tj ET`);

  // Double border, in the platform green.
  ops.push('0.13 0.55 0.38 RG 3 w 30 30 782 535 re S 0.8 w 38 38 766 519 re S');

  centred('E-WASTE-TO-OPPORTUNITY NETWORK', 510, 13, { bold: true, gray: 0.35 });
  centred('Certificate of Participation', 455, 34, { bold: true });
  centred('This is to certify that', 410, 14, { gray: 0.3 });
  centred(c.studentName || 'Student', 365, 30, { bold: true });
  centred('has successfully completed the supervised learning task', 325, 14, { gray: 0.3 });
  centred(c.title || 'Learning task', 290, 20, { bold: true });
  const facts = [fmtHours(c.hours), c.completedAt ? `completed on ${fmtDate(c.completedAt)}` : ''].filter(Boolean).join('  |  ');
  centred(facts, 258, 13, { gray: 0.3 });

  // Signatures: the supervising technician and the platform.
  ops.push('0.5 G 0.8 w 120 150 m 340 150 l S 502 150 m 722 150 l S');
  const sup = fit(c.supervisorName || 'Supervising technician', 12, 210, true);
  at(sup, 230 - textWidth(sup, 12, true) / 2, 133, 12, { bold: true });
  at('Supervising technician', 230 - textWidth('Supervising technician', 10) / 2, 118, 10, { gray: 0.4 });
  const plat = 'E-Waste Network';
  at(plat, 612 - textWidth(plat, 12, true) / 2, 133, 12, { bold: true });
  at('Approved by the platform', 612 - textWidth('Approved by the platform', 10) / 2, 118, 10, { gray: 0.4 });

  centred(`Certificate ID: ${c.certNo}`, 78, 12, { bold: true });
  centred(`Issued on ${fmtDate(c.issuedAt)}. This certificate can be checked with its ID on the E-Waste Network.`, 60, 9, { gray: 0.45 });

  const content = Buffer.from(ops.join('\n'), 'latin1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  const parts = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets = [];
  let length = parts[0].length;
  const add = (buf) => { parts.push(buf); length += buf.length; };
  objects.forEach((body, i) => {
    offsets.push(length);
    add(Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
  });
  offsets.push(length);
  add(Buffer.concat([Buffer.from(`6 0 obj\n<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream\nendobj\n', 'latin1')]));

  const xref = length;
  let table = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { table += `${String(o).padStart(10, '0')} 00000 n \n`; });
  table += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  add(Buffer.from(table, 'latin1'));
  return Buffer.concat(parts);
}

module.exports = { buildCertificatePdf, textWidth, latin1 };