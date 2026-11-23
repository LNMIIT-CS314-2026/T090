'use strict';
// CSV reading and writing (FR-014 import, FR-036 export). RFC 4180: quoted fields, "" escapes, CRLF or LF.

/** Parses CSV text into rows of strings. A UTF-8 byte-order mark and fully empty lines are ignored. */
function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0].trim() === '')) rows.push({ line: rowLine, cells: row });
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else { if (c === '\n') line++; field += c; }
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else field += c;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows; // [{ line, cells: [...] }]
}

function csvCell(value) {
  const v = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** rows: array of arrays → CSV text with CRLF line ends (what spreadsheet programs expect). */
function toCsv(rows) {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { parseCsv, toCsv };
