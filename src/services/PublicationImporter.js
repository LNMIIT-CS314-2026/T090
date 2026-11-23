'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { parseCsv } = require('../domain/csv');
const { validateFields, toPublicationData } = require('../domain/validation');
const { normalizeTitle, normalizeDoi } = require('../domain/normalize');

const MAX_ROWS = 500;

// Column names accepted in the first line (lower case). The first four are mandatory (AC-02).
const COLUMNS = {
  title: ['title'],
  authors: ['authors', 'author'],
  publicationType: ['type', 'publication type', 'publication_type', 'publicationtype'],
  year: ['year', 'publication year'],
  venue: ['venue', 'journal', 'venue / journal', 'source'],
  doiLink: ['doi', 'doi / link', 'doi_link', 'doilink', 'link', 'url'],
  citationCount: ['citations', 'citation count', 'citation_count', 'citationcount', 'cited by', 'times cited'],
};
const REQUIRED = { title: 'title', authors: 'authors', publicationType: 'type', year: 'year' };

// Publication type as written in common exports → PublicationType.
const TYPES = {
  journal: 'JOURNAL', 'journal article': 'JOURNAL', article: 'JOURNAL',
  conference: 'CONFERENCE', 'conference paper': 'CONFERENCE', proceedings: 'CONFERENCE', 'conference proceedings': 'CONFERENCE',
  'book chapter': 'BOOK_CHAPTER', book_chapter: 'BOOK_CHAPTER', chapter: 'BOOK_CHAPTER',
  book: 'BOOK', patent: 'PATENT', other: 'OTHER',
};

/**
 * C5 Publication Management — bulk import (UC-005, FR-014, FR-015). Every row is validated with the
 * same rules as manual entry and checked for duplicates; valid rows become DRAFT_ENTERED records.
 */
class PublicationImporter {
  constructor({ uow, auth, detector, manager }) {
    Object.assign(this, { uow, auth, detector, manager });
  }

  /** Checks the file without saving anything. */
  preview(session, csvText) {
    const rows = this.analyse(session, csvText);
    return { rows: rows.map(publicRow), counts: countRows(rows) };
  }

  /** Imports the valid rows in one transaction. Duplicates are imported (flagged) only if asked. */
  import(session, csvText, includeDuplicates = false) {
    const rows = this.analyse(session, csvText);
    const chosen = rows.filter((r) => r.status === 'OK' || (includeDuplicates && r.status === 'DUPLICATE'));
    if (chosen.length === 0) throw new AppError('VALIDATION_FAILED', MESSAGES.IMPORT_NOTHING, { rows: rows.map(publicRow) });

    const imported = this.uow.run(() =>
      chosen.map((r) => {
        const p = this.manager.createDraft(session.userId, r.data, r.status === 'DUPLICATE');
        return { line: r.line, publicId: p.publicId, id: p.id, title: p.title, duplicateFlag: p.duplicateFlag };
      })
    );
    const skipped = rows
      .filter((r) => !chosen.includes(r))
      .map((r) => ({ line: r.line, title: r.raw.title || '', reason: r.status === 'INVALID' ? Object.values(r.errors).join(' ') : duplicateText(r) }));
    return { imported, skipped };
  }

  analyse(session, csvText) {
    this.auth.authorize(session, 'RESEARCHER'); // also refuses deactivated accounts (BR-009)
    const parsed = parseCsv(csvText);
    if (parsed.length < 2) throw new AppError('VALIDATION_FAILED', MESSAGES.IMPORT_EMPTY);
    if (parsed.length - 1 > MAX_ROWS) throw new AppError('VALIDATION_FAILED', MESSAGES.IMPORT_TOO_MANY(MAX_ROWS));

    const header = parsed[0].cells.map((h) => h.trim().toLowerCase());
    const index = {};
    for (const [field, names] of Object.entries(COLUMNS)) {
      const i = header.findIndex((h) => names.includes(h));
      if (i >= 0) index[field] = i;
    }
    const missing = Object.keys(REQUIRED).filter((f) => index[f] === undefined).map((f) => REQUIRED[f]);
    if (missing.length) throw new AppError('VALIDATION_FAILED', MESSAGES.IMPORT_COLUMNS(missing));

    const seen = new Map(); // duplicate keys of earlier rows in the same file → line
    return parsed.slice(1).map(({ line, cells }) => {
      const raw = {};
      for (const [field, i] of Object.entries(index)) raw[field] = (cells[i] || '').trim();
      const type = TYPES[String(raw.publicationType || '').toLowerCase()] || String(raw.publicationType || '').toUpperCase();
      const input = { ...raw, publicationType: type };

      const v = validateFields(input); // FR-015: same rules as manual entry
      if (!v.valid) return { line, raw, status: 'INVALID', errors: v.errors };
      const data = toPublicationData(input);

      const keys = [`t:${normalizeTitle(data.title)}|${data.year}`];
      const nd = normalizeDoi(data.doiLink);
      if (nd) keys.push(`d:${nd}`);
      const earlier = keys.map((k) => seen.get(k)).find(Boolean);
      for (const k of keys) if (!seen.has(k)) seen.set(k, line);

      const dups = this.detector.findPossibleDuplicates(session.userId, data, null); // FR-016
      if (earlier || dups.length) {
        return { line, raw, data, status: 'DUPLICATE', errors: {}, earlierLine: earlier || null, duplicates: dups.map((d) => d.publicId) };
      }
      return { line, raw, data, status: 'OK', errors: {} };
    });
  }
}

function duplicateText(r) {
  const parts = [];
  if (r.duplicates && r.duplicates.length) parts.push(`same DOI / title and year as ${r.duplicates.join(', ')}`);
  if (r.earlierLine) parts.push(`same as line ${r.earlierLine} of this file`);
  return `Possible duplicate: ${parts.join('; ')}.`;
}

function publicRow(r) {
  return {
    line: r.line,
    title: r.raw.title || '',
    year: r.raw.year || '',
    status: r.status,
    errors: r.errors,
    message: r.status === 'INVALID' ? Object.values(r.errors).join(' ') : r.status === 'DUPLICATE' ? duplicateText(r) : '',
  };
}

function countRows(rows) {
  const c = { ok: 0, duplicate: 0, invalid: 0 };
  for (const r of rows) c[r.status.toLowerCase()]++;
  return c;
}

module.exports = { PublicationImporter, MAX_ROWS };
