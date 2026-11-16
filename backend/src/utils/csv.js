'use strict';
// Minimal CSV writer for the administrators' exports.
//
// Two safety rules live here so no export can forget them:
//  1. Spreadsheet formula injection: a text cell that starts with = + - @ (or a tab or carriage return) is treated as a formula
//     by Excel and Sheets. Names and titles are typed by users, so such cells get a leading apostrophe. Real numbers are
//     written as they are, so a negative amount stays a number.
//  2. Excel opens a UTF-8 file without a BOM as Windows-1252, which garbles names and the rupee sign, so the file starts with one.

const BOM = String.fromCharCode(0xfeff); // written as a character code so no invisible character sits in the source
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * @param columns [{ key, label }]
 * @param rows    plain objects; a missing key is an empty cell
 */
function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  return `${BOM}${[header, ...lines].join('\r\n')}\r\n`;
}

module.exports = { toCsv, cell };
