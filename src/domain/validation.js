/*
 * validateFields(d) — SRS 45.4. Shared by the server (require) and the browser
 * (served at /js/validation.js, exposed as window.RPValidation), so both apply the same rules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPValidation = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PUBLICATION_TYPES = ['JOURNAL', 'CONFERENCE', 'BOOK_CHAPTER', 'BOOK', 'PATENT', 'OTHER'];
  const TYPE_LABELS = {
    JOURNAL: 'Journal article',
    CONFERENCE: 'Conference paper',
    BOOK_CHAPTER: 'Book chapter',
    BOOK: 'Book',
    PATENT: 'Patent',
    OTHER: 'Other',
  };

  const DOI_RE = /^(https?:\/\/(dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+$/i;
  const URL_RE = /^https?:\/\/[^\s/?#]+\.[^\s]*$/i;

  function str(v) {
    return v === undefined || v === null ? '' : String(v).trim();
  }

  function validateFields(d, now) {
    d = d || {};
    const currentYear = (now || new Date()).getFullYear();
    const errors = {};

    const title = str(d.title);
    if (!title) errors.title = 'Title is required.';
    else if (title.length > 300) errors.title = 'Title must be at most 300 characters.';

    if (!str(d.authors)) errors.authors = 'At least one author is required.';

    if (!PUBLICATION_TYPES.includes(str(d.publicationType))) errors.publicationType = 'Select a publication type.';

    const year = str(d.year);
    if (!year) errors.year = 'Year is required.';
    else if (!/^\d+$/.test(year) || Number(year) < 1900 || Number(year) > currentYear) {
      errors.year = 'Enter a year between 1900 and ' + currentYear + '.';
    }

    const citations = str(d.citationCount);
    if (citations !== '' && !/^\d+$/.test(citations)) {
      errors.citationCount = 'Citation count must be a whole number ≥ 0.';
    }

    const doi = str(d.doiLink);
    if (doi && !(DOI_RE.test(doi) || URL_RE.test(doi))) {
      errors.doiLink = 'Enter a DOI (10.xxxx/...) or an http(s) link.';
    }

    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  /** Converts already-validated form input into clean PublicationData. */
  function toPublicationData(d) {
    const citations = str(d.citationCount);
    return {
      title: str(d.title),
      authors: str(d.authors),
      publicationType: str(d.publicationType),
      venue: str(d.venue) || null,
      year: parseInt(str(d.year), 10),
      doiLink: str(d.doiLink) || null,
      citationCount: citations === '' ? 0 : parseInt(citations, 10),
    };
  }

  return { PUBLICATION_TYPES, TYPE_LABELS, validateFields, toPublicationData };
});
