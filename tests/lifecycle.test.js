'use strict';
// Publication lifecycle through the services (UC-004, UC-006, UC-008), one seeded in-memory database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createContext, EMAILS } = require('./helpers');
const { AuditService } = require('../src/services/AuditService');

const { db, services, login, pubId } = createContext();
const pm = services.publications;
const vm = services.verification;

const sourabh = login(EMAILS.sourabh);
const arjun = login(EMAILS.arjun);
const prayag = login(EMAILS.prayag);

const count = (sql, ...args) => db.prepare(sql).get(...args).n;
const auditCount = (publicId) => count('SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = ?', publicId);
const metricsOf = (session) => services.dashboards.getIndividualView(session, 'me').metrics;

function assertAppError(fn, code) {
  assert.throws(fn, (err) => {
    assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
    return true;
  });
}

const NEW_PUB = {
  title: 'Citation Networks of Indian Engineering Theses',
  authors: 'Sourabh, M. Rao',
  publicationType: 'JOURNAL',
  venue: 'Scientometrics',
  year: 2026,
  doiLink: '10.1007/s11192-026-01120-1',
  citationCount: 4,
};
let created; // P-1120

test('1. a valid publication is saved as DRAFT_ENTERED with public ID P-1120 (UC-004, AC-04)', () => {
  const r = pm.addPublication(sourabh, NEW_PUB);
  assert.equal(r.result, 'SAVED');
  created = r.publication;
  assert.equal(created.status, 'DRAFT_ENTERED');
  assert.equal(created.publicId, 'P-1120');
  assert.equal(created.duplicateFlag, false);
  assert.equal(created.ownerId, sourabh.userId);
});

test('validation failure stores nothing', () => {
  const before = count('SELECT COUNT(*) AS n FROM publications');
  const r = pm.addPublication(sourabh, { ...NEW_PUB, title: '', year: 2099 });
  assert.equal(r.result, 'VALIDATION_FAILED');
  assert.deepEqual(Object.keys(r.errors).sort(), ['title', 'year']);
  assert.equal(count('SELECT COUNT(*) AS n FROM publications'), before);
});

test('2. same DOI as P-1042 → DUPLICATE_WARNING; confirmed → saved with duplicate_flag (FR-016, BR-008)', () => {
  const dupData = { ...NEW_PUB, title: 'Another title entirely', doiLink: 'https://doi.org/10.1109/ACCESS.2025.3361042' };
  const before = count('SELECT COUNT(*) AS n FROM publications');
  const warn = pm.addPublication(sourabh, dupData, false);
  assert.equal(warn.result, 'DUPLICATE_WARNING');
  assert.deepEqual(warn.duplicates.map((d) => d.publicId), ['P-1042', 'P-1110']);
  assert.equal(count('SELECT COUNT(*) AS n FROM publications'), before, 'nothing stored');

  const saved = pm.addPublication(sourabh, dupData, true);
  assert.equal(saved.result, 'SAVED');
  assert.equal(saved.publication.duplicateFlag, true);
  assert.equal(saved.publication.publicId, 'P-1121');
});

test('duplicate rules apply to the same owner only', () => {
  const r = pm.addPublication(arjun, { ...NEW_PUB, doiLink: '10.1109/ACCESS.2025.3361042' });
  assert.equal(r.result, 'SAVED');
});

test('3. submit → SUBMITTED and exactly 2 NEW_RECORD_PENDING notifications (FR-017, FR-039)', () => {
  const p = pm.submitForVerification(sourabh, created.id);
  assert.equal(p.status, 'SUBMITTED');
  assert.ok(p.submittedAt);
  assert.equal(count("SELECT COUNT(*) AS n FROM notifications WHERE publication_id = ? AND type = 'NEW_RECORD_PENDING'", created.id), 2);
  const recipients = db
    .prepare("SELECT u.email FROM notifications n JOIN users u ON u.user_id = n.recipient_id WHERE n.publication_id = ? ORDER BY u.email")
    .all(created.id)
    .map((r) => r.email);
  assert.deepEqual(recipients, [EMAILS.prayag, EMAILS.pulkit]);
  assert.equal(count("SELECT COUNT(*) AS n FROM notifications WHERE publication_id = ? AND email_status = 'SENT'", created.id), 2, 'e-mails dispatched after commit');
});

test('4. SUBMITTED / VERIFIED records cannot be edited; another researcher gets ACCESS_DENIED (BR-001, BR-003)', () => {
  assertAppError(() => pm.updatePublication(sourabh, created.id, NEW_PUB), 'INVALID_STATE');
  assertAppError(() => pm.updatePublication(sourabh, pubId('P-1042').id, NEW_PUB), 'INVALID_STATE');
  assertAppError(() => pm.deletePublication(sourabh, pubId('P-1042').id), 'INVALID_STATE');
  assertAppError(() => pm.submitForVerification(sourabh, pubId('P-1042').id), 'INVALID_STATE');
  assertAppError(() => pm.updatePublication(arjun, pubId('P-1101').id, NEW_PUB), 'ACCESS_DENIED');
  assertAppError(() => pm.deletePublication(arjun, pubId('P-1101').id), 'ACCESS_DENIED');
});

test('researchers cannot use the verification service (BR-005)', () => {
  assertAppError(() => vm.getPendingQueue(sourabh), 'ACCESS_DENIED');
  assertAppError(() => vm.openForReview(sourabh, created.id), 'ACCESS_DENIED');
  assertAppError(() => vm.verify(sourabh, created.id), 'ACCESS_DENIED');
});

test('5. open → UNDER_REVIEW; blank reason refused; reject with reason (FR-019, FR-020, T9, T10)', () => {
  const metricsBefore = metricsOf(sourabh);
  const opened = vm.openForReview(prayag, created.id);
  assert.equal(opened.status, 'UNDER_REVIEW');
  assert.equal(opened.reviewerId, prayag.userId);
  assert.equal(vm.openForReview(prayag, created.id).version, opened.version, 'opening again changes nothing');
  assert.ok(vm.getPendingQueue(prayag).inReview.some((p) => p.id === created.id));

  assertAppError(() => vm.reject(prayag, created.id, '   ', opened.version), 'REASON_REQUIRED');
  assert.equal(pubId('P-1120').status, 'UNDER_REVIEW');

  const r = vm.reject(prayag, created.id, 'Venue name is missing the volume.', opened.version);
  assert.equal(r.publication.status, 'REJECTED');
  assert.equal(r.metrics, null);
  assert.equal(count("SELECT COUNT(*) AS n FROM verifications WHERE publication_id = ? AND decision = 'REJECTED'", created.id), 1);
  assert.equal(auditCount('P-1120'), 1);
  const note = db.prepare("SELECT * FROM notifications WHERE publication_id = ? AND type = 'PUBLICATION_REJECTED'").get(created.id);
  assert.equal(note.recipient_id, sourabh.userId);
  assert.match(note.message, /^P-1120 '.*' was rejected: Venue name is missing the volume\.$/);
  assert.deepEqual(metricsOf(sourabh), metricsBefore, 'metrics unchanged');
});

test('6. correcting a rejected record moves it back to DRAFT_ENTERED (FR-022, T11)', () => {
  const p = pubId('P-1120');
  const r = pm.updatePublication(sourabh, p.id, { ...NEW_PUB, venue: 'Scientometrics, vol. 131' }, false, p.version);
  assert.equal(r.result, 'SAVED');
  assert.equal(r.publication.status, 'DRAFT_ENTERED');
  assert.equal(r.publication.venue, 'Scientometrics, vol. 131');
  const history = pm.getReviewHistory(sourabh, p.id).history.map((h) => `${h.fromStatus}>${h.toStatus}`);
  assert.deepEqual(history, ['null>DRAFT_ENTERED', 'DRAFT_ENTERED>SUBMITTED', 'SUBMITTED>UNDER_REVIEW', 'UNDER_REVIEW>REJECTED', 'REJECTED>DRAFT_ENTERED']);
  assert.equal(pm.submitForVerification(sourabh, p.id).status, 'SUBMITTED', 'resubmission is T5');
});

test('7. verifying P-1095 recomputes metrics to 27 / 2 / 2 triggered by P-1095 (UC-006 + UC-008)', () => {
  assert.deepEqual(
    (({ totalCitations, hIndex, i10Index }) => ({ totalCitations, hIndex, i10Index }))(metricsOf(sourabh)),
    { totalCitations: 25, hIndex: 2, i10Index: 2 }
  );
  const p = vm.openForReview(prayag, pubId('P-1095').id);
  const r = vm.verify(prayag, p.id, 'Chapter listed in the Springer catalogue', p.version);
  assert.equal(r.publication.status, 'VERIFIED');
  assert.equal(r.metrics.totalCitations, 27);
  assert.equal(r.metrics.hIndex, 2);
  assert.equal(r.metrics.i10Index, 2);
  const stored = metricsOf(sourabh);
  assert.equal(stored.totalCitations, 27);
  assert.equal(stored.triggeredBy, 'P-1095');
  assert.equal(auditCount('P-1095'), 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM notifications WHERE publication_id = ? AND type = 'PUBLICATION_VERIFIED'", p.id), 1);
});

test('8. verifying P-1110 fails with DUPLICATE_OF_VERIFIED and nothing changes (BR-008)', () => {
  const p = vm.openForReview(prayag, pubId('P-1110').id);
  assertAppError(() => vm.verify(prayag, p.id, '', p.version), 'DUPLICATE_OF_VERIFIED');
  assert.equal(pubId('P-1110').status, 'UNDER_REVIEW');
  assert.equal(auditCount('P-1110'), 0);
  assert.equal(metricsOf(sourabh).totalCitations, 27);
  // It can still be rejected as a duplicate.
  assert.equal(vm.reject(prayag, p.id, 'Duplicate of P-1042', p.version).publication.status, 'REJECTED');
});

test('9. verify with a stale version → CONCURRENT_UPDATE', () => {
  const stale = pubId('P-1098').version;
  const opened = vm.openForReview(prayag, pubId('P-1098').id); // version + 1
  assert.equal(opened.version, stale + 1);
  assertAppError(() => vm.verify(prayag, opened.id, '', stale), 'CONCURRENT_UPDATE');
  assert.equal(pubId('P-1098').status, 'UNDER_REVIEW');
  assert.equal(auditCount('P-1098'), 0);
});

test('a decided record cannot be decided again (INVALID_STATE)', () => {
  const p = pubId('P-1095');
  assertAppError(() => vm.verify(prayag, p.id, '', p.version), 'INVALID_STATE');
  assertAppError(() => vm.openForReview(prayag, p.id), 'INVALID_STATE');
});

test('10. AuditService exposes no update or delete method (BR-010)', () => {
  const methods = Object.getOwnPropertyNames(AuditService.prototype);
  assert.deepEqual(methods.filter((m) => /update|delete|remove|edit|clear/i.test(m)), []);
  assert.equal(typeof services.audit.update, 'undefined');
  assert.equal(typeof services.audit.delete, 'undefined');
  assert.equal(typeof services.repos.auditRepo.update, 'undefined');
  assert.equal(typeof services.repos.auditRepo.delete, 'undefined');
});

test('deleting a draft removes it; a deactivated researcher cannot submit (T6, BR-009)', () => {
  const draft = pubId('P-1101');
  pm.deletePublication(sourabh, draft.id);
  assert.equal(pubId('P-1101'), null);
  db.prepare("UPDATE users SET account_status = 'DEACTIVATED' WHERE user_id = ?").run(arjun.userId);
  assertAppError(() => pm.addPublication(arjun, NEW_PUB), 'ACCESS_DENIED');
});
