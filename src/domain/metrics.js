'use strict';
// Pure metric functions (FR-023 to FR-026, BR-004). Inputs are citation counts of VERIFIED publications only.

function totalCitations(citations) {
  return citations.reduce((sum, c) => sum + c, 0);
}

/** Largest h such that h papers have at least h citations each (SRS 45.6). */
function hIndex(citations) {
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 1; i <= sorted.length; i++) {
    if (sorted[i - 1] >= i) h = i;
    else break;
  }
  return h;
}

function i10Index(citations) {
  return citations.filter((c) => c >= 10).length;
}

/** {year: count} of verified publications from the earliest year to the current year, gaps filled with 0. */
function trendByYear(pubs, currentYear = new Date().getFullYear()) {
  if (pubs.length === 0) return {};
  const years = pubs.map((p) => p.year);
  const start = Math.min(...years);
  const end = Math.max(currentYear, ...years);
  const trend = {};
  for (let y = start; y <= end; y++) trend[y] = 0;
  for (const p of pubs) trend[p.year] += 1;
  return trend;
}

module.exports = { totalCitations, hIndex, i10Index, trendByYear };
