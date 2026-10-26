'use strict';
const { normalizeTitle, normalizeDoi } = require('../domain/normalize');

/** C5 DuplicateDetector (FR-016, BR-008): same owner and (same DOI, or same title and year). */
class DuplicateDetector {
  constructor({ publications }) {
    this.publications = publications;
  }

  /** Probable duplicates of form data among the owner's records of any status. */
  findPossibleDuplicates(ownerId, data, excludeId = null) {
    return this.publications.findDuplicateCandidates(
      ownerId,
      normalizeTitle(data.title),
      Number(data.year),
      normalizeDoi(data.doiLink),
      excludeId
    );
  }

  /** A VERIFIED record of the same owner that duplicates pub (used before verifying). */
  findVerifiedDuplicate(ownerId, pub) {
    const found = this.publications.findDuplicateCandidates(
      ownerId,
      pub.normalizedTitle,
      pub.year,
      pub.normalizedDoi,
      pub.id,
      'VERIFIED'
    );
    return found[0] || null;
  }
}

module.exports = { DuplicateDetector };
