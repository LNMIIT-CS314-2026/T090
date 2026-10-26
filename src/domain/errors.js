'use strict';

/** Application error with a stable code (SRS 44.4). The API layer maps the code to an HTTP status. */
class AppError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.extra = extra;
  }
}

const HTTP_STATUS = {
  VALIDATION_FAILED: 422,
  REASON_REQUIRED: 422,
  DUPLICATE_WARNING: 409,
  INVALID_STATE: 409,
  CONCURRENT_UPDATE: 409,
  DUPLICATE_OF_VERIFIED: 409,
  UNAUTHENTICATED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  PERSISTENCE_FAILURE: 503,
};

/** User-facing messages (instruction.md section 7, SRS 43.5). */
const MESSAGES = {
  WRONG_LOGIN: 'The e-mail or password is incorrect.',
  DEACTIVATED: 'This account has been deactivated. Contact the research office.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  NO_PERMISSION: 'You do not have permission to view this page.',
  NO_VERIFY_PERMISSION: 'You do not have permission to verify publication data.',
  NOT_OWNER: 'You can only view or change your own publications.',
  PUBLICATION_NOT_FOUND: 'The publication was not found. It may have been deleted.',
  RESEARCHER_NOT_FOUND: 'The researcher was not found.',
  NOTIFICATION_NOT_FOUND: 'The notification was not found.',
  NOT_EDITABLE: 'This publication can no longer be edited or deleted, because it has been submitted or verified.',
  NOT_SUBMITTABLE: 'Only publications in DRAFT_ENTERED status can be submitted for verification.',
  NOT_PENDING: 'This record is not waiting for verification.',
  NO_LONGER_UNDER_REVIEW: 'This record is no longer under review. Reload.',
  REASON_REQUIRED: 'A rejection reason is required.',
  DUPLICATE_OF_VERIFIED: 'Cannot verify: a VERIFIED record of the same researcher has the same DOI / title and year.',
  CONCURRENT_UPDATE: 'This record was changed elsewhere. Reload the page and try again.',
  SAVE_FAILED: 'The publication could not be saved. Nothing was changed. Retry.',
  REQUEST_FAILED: 'The request could not be completed. Nothing was changed. Retry.',
  validationSummary: (n) => `Please correct ${n} ${n === 1 ? 'field' : 'fields'}. Nothing has been saved yet.`,
  duplicateWarning: (ids) =>
    `A publication with the same DOI / title and year already exists in your records: ${ids.join(', ')}`,
};

module.exports = { AppError, HTTP_STATUS, MESSAGES };
