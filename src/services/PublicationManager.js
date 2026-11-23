'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { PublicationStatus: S, ALL_STATUSES, NEW, DELETED, assertTransition } = require('../domain/PublicationStatus');
const { validateFields, toPublicationData } = require('../domain/validation');
const { normalizeTitle, normalizeDoi } = require('../domain/normalize');

const now = () => new Date().toISOString();

function duplicateSummary(p) {
  return { id: p.id, publicId: p.publicId, title: p.title, year: p.year, status: p.status };
}

/** C5 Publication Management (IPublicationService), UC-004. Researcher only, owner only (BR-001, BR-003). */
class PublicationManager {
  constructor({ uow, publications, verifications, detector, auth, users, notifier }) {
    Object.assign(this, { uow, publications, verifications, detector, auth, users, notifier });
  }

  /** SRS 45.4. Returns { result: 'SAVED' | 'VALIDATION_FAILED' | 'DUPLICATE_WARNING', … }. */
  addPublication(session, data, confirmDuplicate = false) {
    this.auth.authorize(session, 'RESEARCHER'); // also checks the account is ACTIVE (BR-009)

    const v = validateFields(data);
    if (!v.valid) return { result: 'VALIDATION_FAILED', errors: v.errors };
    const d = toPublicationData(data);

    return this.uow.run(() => {
      const dups = this.detector.findPossibleDuplicates(session.userId, d, null);
      if (dups.length > 0 && !confirmDuplicate) {
        return { result: 'DUPLICATE_WARNING', duplicates: dups.map(duplicateSummary) };
      }
      return { result: 'SAVED', publication: this.createDraft(session.userId, d, dups.length > 0) };
    });
  }

  /** T2: stores validated data as a new DRAFT_ENTERED record. Used by addPublication and the CSV import. */
  createDraft(ownerId, d, duplicateFlag) {
    assertTransition(NEW, S.DRAFT_ENTERED);
    const at = now();
    const id = this.publications.insert({
      publicId: this.publications.nextPublicId(),
      ownerId,
      ...d,
      normalizedTitle: normalizeTitle(d.title),
      normalizedDoi: normalizeDoi(d.doiLink),
      status: S.DRAFT_ENTERED,
      duplicateFlag,
      createdAt: at,
      updatedAt: at,
    });
    this.publications.insertHistory(id, null, S.DRAFT_ENTERED, ownerId, at);
    return this.publications.findById(id);
  }

  /** Edit a DRAFT_ENTERED record (T4) or correct a REJECTED one (T11, FR-022). Optimistic locking on version. */
  updatePublication(session, id, data, confirmDuplicate = false, version) {
    this.auth.authorize(session, 'RESEARCHER');
    return this.uow.run(() => {
      const p = this.loadOwned(session, id);
      assertTransition(p.status, S.DRAFT_ENTERED, MESSAGES.NOT_EDITABLE);

      const v = validateFields(data);
      if (!v.valid) return { result: 'VALIDATION_FAILED', errors: v.errors };
      const d = toPublicationData(data);

      const dups = this.detector.findPossibleDuplicates(session.userId, d, p.id);
      if (dups.length > 0 && !confirmDuplicate) {
        return { result: 'DUPLICATE_WARNING', duplicates: dups.map(duplicateSummary) };
      }

      const expected = version === undefined || version === null || version === '' ? p.version : Number(version);
      const at = now();
      const changed = this.publications.updateFields(p.id, expected, {
        ...d,
        normalizedTitle: normalizeTitle(d.title),
        normalizedDoi: normalizeDoi(d.doiLink),
        status: S.DRAFT_ENTERED,
        duplicateFlag: dups.length > 0,
        updatedAt: at,
      });
      if (changed === 0) throw new AppError('CONCURRENT_UPDATE', MESSAGES.CONCURRENT_UPDATE);
      if (p.status !== S.DRAFT_ENTERED) this.publications.insertHistory(p.id, p.status, S.DRAFT_ENTERED, session.userId, at);
      return { result: 'SAVED', publication: this.publications.findById(p.id) };
    });
  }

  /** T6 / T12: owner deletes a DRAFT_ENTERED or REJECTED record. */
  deletePublication(session, id) {
    this.auth.authorize(session, 'RESEARCHER');
    this.uow.run(() => {
      const p = this.loadOwned(session, id);
      assertTransition(p.status, DELETED, MESSAGES.NOT_EDITABLE);
      this.publications.delete(p.id);
    });
  }

  /** T5: DRAFT_ENTERED → SUBMITTED and all active administrators are notified (FR-017, FR-039). */
  submitForVerification(session, id) {
    const researcher = this.auth.authorize(session, 'RESEARCHER');
    return this.uow.run(() => {
      const p = this.loadOwned(session, id);
      assertTransition(p.status, S.SUBMITTED, MESSAGES.NOT_SUBMITTABLE);
      const at = now();
      const changed = this.publications.updateFields(p.id, p.version, {
        status: S.SUBMITTED,
        submittedAt: at,
        reviewerId: null,
        updatedAt: at,
      });
      if (changed === 0) throw new AppError('CONCURRENT_UPDATE', MESSAGES.CONCURRENT_UPDATE);
      this.publications.insertHistory(p.id, p.status, S.SUBMITTED, session.userId, at);
      this.notifier.notifyAdministrators(
        'NEW_RECORD_PENDING',
        `${researcher.name} submitted ${p.publicId} '${p.title}' for verification.`,
        p.id
      );
      this.uow.afterCommit(() => this.notifier.dispatchPending());
      return this.publications.findById(p.id);
    });
  }

  getMyPublications(session, filter = {}) {
    this.auth.authorize(session, 'RESEARCHER');
    const text = typeof filter.text === 'string' ? filter.text.trim() : '';
    const year = /^\d{4}$/.test(String(filter.year || '').trim()) ? Number(filter.year) : null;
    const status = ALL_STATUSES.includes(filter.status) ? filter.status : null;
    return this.publications.findByOwner(session.userId, { text, year, status });
  }

  /** The owner or any research administrator may read a record. Admins also get the live duplicate check (W04). */
  getPublication(session, id) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN']);
    const p = this.loadReadable(session, id);
    if (session.role === 'RESEARCH_ADMIN') {
      const dup = this.detector.findVerifiedDuplicate(p.ownerId, p);
      p.verifiedDuplicate = dup ? duplicateSummary(dup) : null;
    }
    return p;
  }

  getReviewHistory(session, id) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN']);
    const p = this.loadReadable(session, id);
    return {
      verifications: this.verifications.findByPublication(p.id),
      history: this.publications.findHistory(p.id),
    };
  }

  loadReadable(session, id) {
    const p = this.publications.findById(id);
    if (!p) throw new AppError('NOT_FOUND', MESSAGES.PUBLICATION_NOT_FOUND);
    if (session.role !== 'RESEARCH_ADMIN' && p.ownerId !== session.userId) {
      throw new AppError('ACCESS_DENIED', MESSAGES.NOT_OWNER);
    }
    return p;
  }

  loadOwned(session, id) {
    const p = this.publications.findById(id);
    if (!p) throw new AppError('NOT_FOUND', MESSAGES.PUBLICATION_NOT_FOUND);
    if (p.ownerId !== session.userId) throw new AppError('ACCESS_DENIED', MESSAGES.NOT_OWNER);
    return p;
  }
}

module.exports = { PublicationManager };
