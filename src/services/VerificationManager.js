'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { PublicationStatus: S, assertTransition } = require('../domain/PublicationStatus');
const { milestones } = require('../domain/metrics');

const ADMIN = 'RESEARCH_ADMIN';
const now = () => new Date().toISOString();

/** C6 Verification Management (IVerificationService), UC-006. Research administrators only (BR-005). */
class VerificationManager {
  constructor({ uow, publications, verifications, detector, auth, audit, metrics, notifier }) {
    Object.assign(this, { uow, publications, verifications, detector, auth, audit, metrics, notifier });
  }

  /** SUBMITTED records oldest first (AC-07), plus UNDER_REVIEW records opened by this administrator. */
  getPendingQueue(session, { departmentId, text } = {}) {
    this.auth.authorize(session, ADMIN, MESSAGES.NO_VERIFY_PERMISSION);
    const filter = {
      departmentId: /^\d+$/.test(String(departmentId || '')) ? Number(departmentId) : null,
      text: typeof text === 'string' ? text.trim() : '',
    };
    return {
      pending: this.publications.findQueue({ status: S.SUBMITTED, ...filter }),
      inReview: this.publications.findQueue({ status: S.UNDER_REVIEW, reviewerId: session.userId, ...filter }),
    };
  }

  /** T7: SUBMITTED → UNDER_REVIEW with reviewer_id. Calling it again on UNDER_REVIEW changes nothing. */
  openForReview(session, id) {
    this.auth.authorize(session, ADMIN, MESSAGES.NO_VERIFY_PERMISSION);
    return this.uow.run(() => {
      const p = this.load(id);
      if (p.status === S.UNDER_REVIEW) return p;
      assertTransition(p.status, S.UNDER_REVIEW, MESSAGES.NOT_PENDING);
      const at = now();
      const changed = this.publications.updateFields(p.id, p.version, { status: S.UNDER_REVIEW, reviewerId: session.userId, updatedAt: at });
      if (changed === 0) throw new AppError('CONCURRENT_UPDATE', MESSAGES.CONCURRENT_UPDATE);
      this.publications.insertHistory(p.id, p.status, S.UNDER_REVIEW, session.userId, at);
      return this.publications.findById(p.id);
    });
  }

  /** T8 (SRS 45.5). Returns { publication, metrics }. */
  verify(session, id, comments, version) {
    return this.decide(session, id, S.VERIFIED, comments, version);
  }

  /** T9; a blank reason is refused with REASON_REQUIRED and nothing changes (T10). Metrics are not recomputed. */
  reject(session, id, reason, version) {
    return this.decide(session, id, S.REJECTED, reason, version);
  }

  decide(session, id, decision, text, version) {
    const admin = this.auth.authorize(session, ADMIN, MESSAGES.NO_VERIFY_PERMISSION);
    const clean = text === undefined || text === null ? '' : String(text).trim();
    if (decision === S.REJECTED && !clean) throw new AppError('REASON_REQUIRED', MESSAGES.REASON_REQUIRED);

    return this.uow.run(() => {
      const p = this.load(id);
      if (p.status !== S.UNDER_REVIEW) throw new AppError('INVALID_STATE', MESSAGES.NO_LONGER_UNDER_REVIEW);
      if (version !== undefined && version !== null && version !== '' && Number(version) !== p.version) {
        throw new AppError('CONCURRENT_UPDATE', MESSAGES.CONCURRENT_UPDATE);
      }
      if (decision === S.VERIFIED) {
        const dup = this.detector.findVerifiedDuplicate(p.ownerId, p);
        if (dup) throw new AppError('DUPLICATE_OF_VERIFIED', MESSAGES.DUPLICATE_OF_VERIFIED, { duplicate: dup.publicId });
      }
      assertTransition(p.status, decision);

      const at = now();
      const changed = this.publications.updateFields(p.id, p.version, { status: decision, updatedAt: at });
      if (changed === 0) throw new AppError('CONCURRENT_UPDATE', MESSAGES.CONCURRENT_UPDATE);
      this.publications.insertHistory(p.id, p.status, decision, session.userId, at);

      this.verifications.insert({
        publicationId: p.id,
        administratorId: session.userId,
        decision,
        comments: clean || null,
        decisionDate: at,
      });
      this.audit.record(decision === S.VERIFIED ? 'VERIFY' : 'REJECT', session.userId, p.publicId, clean || null);

      let metrics = null;
      if (decision === S.VERIFIED) metrics = this.metrics.recompute(p.ownerId, p.publicId, at); // UC-006 «include» UC-008

      if (decision === S.VERIFIED) {
        // Milestones first, so the verification outcome is the newest notification (FR-038, FR-037).
        for (const text of milestones(metrics.previous, metrics)) {
          this.notifier.notifyResearcher(p.ownerId, 'MILESTONE', `${text} (after ${p.publicId} was verified)`, p.id);
        }
        this.notifier.notifyResearcher(p.ownerId, 'PUBLICATION_VERIFIED', `${p.publicId} '${p.title}' was verified by ${admin.name}.`, p.id);
      } else {
        this.notifier.notifyResearcher(p.ownerId, 'PUBLICATION_REJECTED', `${p.publicId} '${p.title}' was rejected: ${clean}`, p.id);
      }
      this.uow.afterCommit(() => this.notifier.dispatchPending());

      return { publication: this.publications.findById(p.id), metrics };
    });
  }

  load(id) {
    const p = this.publications.findById(id);
    if (!p) throw new AppError('NOT_FOUND', MESSAGES.PUBLICATION_NOT_FOUND);
    return p;
  }
}

module.exports = { VerificationManager };
