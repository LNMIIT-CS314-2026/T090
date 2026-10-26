'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { totalCitations, hIndex, i10Index, trendByYear } = require('../src/domain/metrics');

test('hIndex follows the standard definition (FR-024)', () => {
  assert.equal(hIndex([]), 0);
  assert.equal(hIndex([14, 11]), 2);
  assert.equal(hIndex([0, 0]), 0);
  assert.equal(hIndex([10, 10, 10]), 3);
  assert.equal(hIndex([25, 8, 5, 3, 3]), 3);
  assert.equal(hIndex([100]), 1);
  assert.equal(hIndex([11, 14]), 2, 'input order does not matter');
  assert.equal(hIndex(Array(11).fill(10)), 10, 'eleven papers with 10 citations each');
});

test('i10Index counts papers with at least 10 citations (FR-025)', () => {
  assert.equal(i10Index([14, 11]), 2);
  assert.equal(i10Index([9, 10]), 1);
  assert.equal(i10Index([]), 0);
});

test('totalCitations is the sum (FR-023)', () => {
  assert.equal(totalCitations([14, 11]), 25);
  assert.equal(totalCitations([25, 8, 5, 3, 3]), 44);
  assert.equal(totalCitations([]), 0);
});

test('trendByYear fills missing years with 0 up to the current year (FR-026)', () => {
  const trend = trendByYear([{ year: 2022 }, { year: 2024 }, { year: 2024 }], 2026);
  assert.deepEqual(trend, { 2022: 1, 2023: 0, 2024: 2, 2025: 0, 2026: 0 });
  assert.deepEqual(trendByYear([], 2026), {});
});
