'use strict';

/** Lower case, punctuation replaced by spaces, whitespace collapsed (FR-016). "Graph-Based" equals "Graph Based". */
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lower case DOI without resolver prefixes; null for plain URLs or empty values. */
function normalizeDoi(value) {
  let s = String(value || '').trim().toLowerCase();
  if (!s) return null;
  s = s
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:\s*/, '')
    .trim();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null;
}

module.exports = { normalizeTitle, normalizeDoi };
