'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateFields } = require('../src/domain/validation');
const { normalizeTitle, normalizeDoi } = require('../src/domain/normalize');

const YEAR = new Date().getFullYear();
const valid = () => ({ title: 'A valid title', authors: 'A. Author, B. Author', publicationType: 'JOURNAL', year: 2024 });
const errorsOf = (patch) => validateFields({ ...valid(), ...patch }).errors;

test('a complete record is valid', () => {
  assert.deepEqual(validateFields(valid()), { valid: true, errors: {} });
});

test('all mandatory fields reported with their messages (AC-02)', () => {
  const r = validateFields({});
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors, {
    title: 'Title is required.',
    authors: 'At least one author is required.',
    publicationType: 'Select a publication type.',
    year: 'Year is required.',
  });
});

test('title length: 300 allowed, 301 refused', () => {
  assert.equal(errorsOf({ title: 'x'.repeat(300) }).title, undefined);
  assert.equal(errorsOf({ title: 'x'.repeat(301) }).title, 'Title must be at most 300 characters.');
  assert.equal(errorsOf({ title: '   ' }).title, 'Title is required.');
});

test('publication type must be one of the known types', () => {
  assert.equal(errorsOf({ publicationType: 'BLOG' }).publicationType, 'Select a publication type.');
  assert.equal(errorsOf({ publicationType: 'PATENT' }).publicationType, undefined);
});

test('year: 1899 and next year refused, 1900 and current year accepted', () => {
  const msg = `Enter a year between 1900 and ${YEAR}.`;
  assert.equal(errorsOf({ year: 1899 }).year, msg);
  assert.equal(errorsOf({ year: 1900 }).year, undefined);
  assert.equal(errorsOf({ year: YEAR }).year, undefined);
  assert.equal(errorsOf({ year: YEAR + 1 }).year, msg);
  assert.equal(errorsOf({ year: '2024' }).year, undefined, 'form strings are accepted');
  assert.equal(errorsOf({ year: '20x4' }).year, msg);
  assert.equal(errorsOf({ year: '' }).year, 'Year is required.');
});

test('citation count: optional, whole number ≥ 0', () => {
  const msg = 'Citation count must be a whole number ≥ 0.';
  assert.equal(errorsOf({ citationCount: -1 }).citationCount, msg);
  assert.equal(errorsOf({ citationCount: 1.5 }).citationCount, msg);
  assert.equal(errorsOf({ citationCount: 'many' }).citationCount, msg);
  assert.equal(errorsOf({ citationCount: 0 }).citationCount, undefined);
  assert.equal(errorsOf({ citationCount: '' }).citationCount, undefined, 'blank means 0');
  assert.equal(errorsOf({ citationCount: undefined }).citationCount, undefined);
});

test('DOI / link: DOI, doi.org DOI and plain https URL accepted, other strings refused', () => {
  const msg = 'Enter a DOI (10.xxxx/...) or an http(s) link.';
  assert.equal(errorsOf({ doiLink: '10.1109/ACCESS.2025.3361042' }).doiLink, undefined);
  assert.equal(errorsOf({ doiLink: 'https://doi.org/10.1109/ACCESS.2025.3361042' }).doiLink, undefined);
  assert.equal(errorsOf({ doiLink: 'https://ieeexplore.ieee.org/document/1042' }).doiLink, undefined);
  assert.equal(errorsOf({ doiLink: 'not a doi' }).doiLink, msg);
  assert.equal(errorsOf({ doiLink: '10.12/too-short-prefix' }).doiLink, msg);
  assert.equal(errorsOf({ doiLink: '' }).doiLink, undefined, 'optional');
});

test('normalisation used for duplicate detection (FR-016)', () => {
  assert.equal(normalizeTitle('Graph-Based  Citation Analysis!'), 'graph based citation analysis');
  assert.equal(normalizeTitle('Graph Based Citation Analysis'), 'graph based citation analysis');
  assert.equal(normalizeDoi('https://doi.org/10.1109/ACCESS.2025.3361042'), '10.1109/access.2025.3361042');
  assert.equal(normalizeDoi('http://dx.doi.org/10.1109/X.1'), '10.1109/x.1');
  assert.equal(normalizeDoi('doi:10.1109/X.1'), '10.1109/x.1');
  assert.equal(normalizeDoi('https://example.org/paper'), null);
  assert.equal(normalizeDoi(''), null);
});
