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

/** Totals for any group of verified publications (a researcher, a department, the institute). */
function summarize(pubs) {
  const citations = pubs.map((p) => Math.max(0, p.citationCount));
  const byType = {};
  for (const p of pubs) byType[p.publicationType] = (byType[p.publicationType] || 0) + 1;
  return {
    publications: pubs.length,
    citations: totalCitations(citations),
    hIndex: hIndex(citations),
    i10Index: i10Index(citations),
    byType,
  };
}

const CITATION_MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Research milestones reached by a recomputation (FR-038): h-index or i10-index went up, or total
 * citations passed one of CITATION_MILESTONES. Returns plain sentences for the researcher.
 */
function milestones(prev, next) {
  const p = prev || { totalCitations: 0, hIndex: 0, i10Index: 0 };
  const out = [];
  if (next.hIndex > p.hIndex) out.push(`Your h-index rose from ${p.hIndex} to ${next.hIndex}.`);
  if (next.i10Index > p.i10Index) out.push(`Your i10-index rose from ${p.i10Index} to ${next.i10Index}.`);
  const passed = CITATION_MILESTONES.filter((m) => p.totalCitations < m && next.totalCitations >= m);
  if (passed.length) out.push(`Your verified publications have reached ${passed[passed.length - 1]} citations.`);
  return out;
}

module.exports = { totalCitations, hIndex, i10Index, trendByYear, summarize, milestones, CITATION_MILESTONES };
