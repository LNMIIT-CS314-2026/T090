'use strict';
const { AppError } = require('./errors');

/** PublicationStatus enumeration (SRS 32.4) and the lifecycle of State Diagram 01 (SRS 37.2). */
const PublicationStatus = Object.freeze({
  DRAFT_ENTERED: 'DRAFT_ENTERED',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

const ALL_STATUSES = Object.values(PublicationStatus);

/** Pseudo-states: NEW is "not yet stored", DELETED is the final state after a delete. */
const NEW = null;
const DELETED = 'DELETED';

const S = PublicationStatus;
const TRANSITIONS = [
  { id: 'T2', from: NEW, to: S.DRAFT_ENTERED, trigger: 'save as draft' },
  { id: 'T4', from: S.DRAFT_ENTERED, to: S.DRAFT_ENTERED, trigger: 'edit' },
  { id: 'T5', from: S.DRAFT_ENTERED, to: S.SUBMITTED, trigger: 'submit' },
  { id: 'T6', from: S.DRAFT_ENTERED, to: DELETED, trigger: 'delete' },
  { id: 'T7', from: S.SUBMITTED, to: S.UNDER_REVIEW, trigger: 'administrator opens record' },
  { id: 'T8', from: S.UNDER_REVIEW, to: S.VERIFIED, trigger: 'verify' },
  { id: 'T9', from: S.UNDER_REVIEW, to: S.REJECTED, trigger: 'reject' },
  { id: 'T11', from: S.REJECTED, to: S.DRAFT_ENTERED, trigger: 'correct' },
  { id: 'T12', from: S.REJECTED, to: DELETED, trigger: 'delete' },
];
// T10 (reject with an empty reason) is a refusal, not a transition: VerificationManager throws REASON_REQUIRED.

function findTransition(from, to) {
  return TRANSITIONS.find((t) => t.from === from && t.to === to) || null;
}

/** Throws INVALID_STATE unless from → to is an allowed transition. Returns the transition. */
function assertTransition(from, to, message) {
  const t = findTransition(from, to);
  if (!t) {
    throw new AppError('INVALID_STATE', message || `A publication in status ${from} cannot change to ${to}.`);
  }
  return t;
}

/** BR-003: only DRAFT_ENTERED and REJECTED records may be edited or deleted by their owner. */
function isEditable(status) {
  return status === S.DRAFT_ENTERED || status === S.REJECTED;
}

module.exports = { PublicationStatus, ALL_STATUSES, NEW, DELETED, TRANSITIONS, findTransition, assertTransition, isEditable };
