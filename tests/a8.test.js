'use strict';
// Assignment 8 (sections 47–50): test cases TC-01 – TC-25 of section 48.2.
// Every test case starts from a fresh in-memory copy of the demo data (DD-10), so the
// expected values of the document (25 / 2 / 2, P-1120, …) hold regardless of order.
// Service-level checks call the L3 interfaces of section 44.3; system tests go over HTTP (section 44.5).
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const { buildServices } = require('../src/services');
const { createApp } = require('../src/app');
const { mailLogPath, EMAILS } = require('./helpers');

const CY = new Date().getFullYear(); // "current year" of DD-05 (2026 when the document was executed)
const KARTIK = 'kartik.mantri@lnmiit.ac.in';

// ---------------------------------------------------------------- fixtures

function fresh(opts = {}) {
  const db = openDb(':memory:');
  seed(db);
  const services = buildServices(db, { mailLogPath: mailLogPath(), quiet: true, ...opts });
  const login = (email) => services.auth.login(email, 'demo123').session;
  const pub = (publicId) => services.repos.publications.findByPublicId(publicId);
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const metricsOf = (session) => services.dashboards.getIndividualView(session, 'me').metrics;
  return { db, services, login, pub, count, metricsOf, pm: services.publications, vm: services.verification };
}

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return 'NO_ERROR';
}

async function withServer(fn) {
  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db, { mailLogPath: mailLogPath(), quiet: true });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { body, cookie } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
  const login = async (email, password = 'demo123') => {
    const res = await call('POST', '/api/auth/login', { body: { email, password } });
    return { ...res, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
  };
  const pubId = (publicId) => db.prepare('SELECT publication_id AS id, version FROM publications WHERE public_id = ?').get(publicId);
  try {
    await fn({ db, call, login, pubId });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const VALID = {
  title: 'Citation Networks in Indian Engineering Research',
  authors: 'Sourabh, A. Gupta',
  publicationType: 'JOURNAL',
  venue: 'Scientometrics',
  year: 2025,
  doiLink: '10.1007/s11192-025-05001',
  citationCount: 3,
};
let probe = 0;
const unique = (over = {}) => ({ ...VALID, doiLink: '', title: `Boundary probe ${++probe}`, ...over });

// ---------------------------------------------------------------- UC-004 Add Publication (Manual)

test('TC-01 [EP valid class] valid manual entry is saved as DRAFT_ENTERED', () => {
  const { pm, login, count } = fresh();
  const s = login(EMAILS.sourabh);
  // A8 ran on 13 seeded records (13 → 14); the second increment added 9 records in CCE and ME.
  const before = count('SELECT COUNT(*) AS n FROM publications');
  assert.equal(before, 22);
  const r = pm.addPublication(s, VALID);
  assert.equal(r.result, 'SAVED');
  assert.equal(r.publication.publicId, 'P-1120');
  assert.equal(r.publication.status, 'DRAFT_ENTERED');
  assert.equal(r.publication.citationCount, 3);
  assert.equal(count('SELECT COUNT(*) AS n FROM publications'), before + 1);
});

test('TC-02 [EP invalid class] empty mandatory fields → VALIDATION_FAILED, nothing saved', async () => {
  await withServer(async ({ call, login, db }) => {
    const { cookie } = await login(EMAILS.sourabh);
    const own = () => db.prepare('SELECT COUNT(*) AS n FROM publications WHERE owner_id = 1').get().n;
    assert.equal(own(), 6);
    const res = await call('POST', '/api/publications', {
      cookie,
      body: { title: '', authors: '', publicationType: '', year: '', venue: 'IEEE Access' },
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.code, 'VALIDATION_FAILED');
    assert.equal(res.body.message, 'Please correct 4 fields. Nothing has been saved yet.');
    assert.deepEqual(Object.keys(res.body.fieldErrors).sort(), ['authors', 'publicationType', 'title', 'year']);
    assert.equal(res.body.fieldErrors.title, 'Title is required.');
    assert.equal(res.body.fieldErrors.authors, 'At least one author is required.');
    assert.equal(res.body.fieldErrors.publicationType, 'Select a publication type.');
    assert.equal(res.body.fieldErrors.year, 'Year is required.');
    assert.equal(own(), 6);
  });
});

test(`TC-03 [BVA] publication year 1899 / 1900 / ${CY} / ${CY + 1}`, () => {
  const { pm, login } = fresh();
  const s = login(EMAILS.sourabh);
  const msg = `Enter a year between 1900 and ${CY}.`;
  for (const year of [1899, CY + 1]) {
    const r = pm.addPublication(s, unique({ year }));
    assert.equal(r.result, 'VALIDATION_FAILED', `year ${year}`);
    assert.equal(r.errors.year, msg);
  }
  for (const year of [1900, 1901, CY - 1, CY]) {
    assert.equal(pm.addPublication(s, unique({ year })).result, 'SAVED', `year ${year}`);
  }
});

test('TC-04 [BVA] title length 0 / blank / 1 / 299 / 300 / 301 characters', () => {
  const { pm, login } = fresh();
  const s = login(EMAILS.sourabh);
  const refused = { '': 'Title is required.', '   ': 'Title is required.', ['x'.repeat(301)]: 'Title must be at most 300 characters.' };
  for (const [title, message] of Object.entries(refused)) {
    const r = pm.addPublication(s, unique({ title }));
    assert.equal(r.result, 'VALIDATION_FAILED', `length ${title.length}`);
    assert.equal(r.errors.title, message);
  }
  for (const n of [1, 299, 300]) {
    const title = String.fromCharCode(97 + (n % 26)).repeat(n);
    assert.equal(pm.addPublication(s, unique({ title })).result, 'SAVED', `length ${n}`);
  }
});

test('TC-05 [EP] citation count and DOI / link classes (server validation)', () => {
  const { pm, login } = fresh();
  const s = login(EMAILS.sourabh);
  const citeMsg = 'Citation count must be a whole number ≥ 0.';
  const doiMsg = 'Enter a DOI (10.xxxx/...) or an http(s) link.';

  const blank = pm.addPublication(s, unique({ citationCount: '' }));
  assert.equal(blank.result, 'SAVED');
  assert.equal(blank.publication.citationCount, 0);
  for (const c of [0, 25]) assert.equal(pm.addPublication(s, unique({ citationCount: c })).result, 'SAVED', `citations ${c}`);
  for (const c of [-1, 2.5, 'ten']) {
    const r = pm.addPublication(s, unique({ citationCount: c }));
    assert.equal(r.result, 'VALIDATION_FAILED', `citations ${c}`);
    assert.equal(r.errors.citationCount, citeMsg);
  }

  const goodDois = ['', '10.1109/ACCESS.2024.3300001', 'https://doi.org/10.1109/ACCESS.2024.3300002', 'https://ieeexplore.ieee.org/document/10500001'];
  for (const doiLink of goodDois) assert.equal(pm.addPublication(s, unique({ doiLink })).result, 'SAVED', `doi "${doiLink}"`);
  for (const doiLink of ['not a doi', 'ftp://x.org/a']) {
    const r = pm.addPublication(s, unique({ doiLink }));
    assert.equal(r.result, 'VALIDATION_FAILED', `doi "${doiLink}"`);
    assert.equal(r.errors.doiLink, doiMsg);
  }
});

test('TC-06 [EP + alternative flow] probable duplicate is flagged before saving', () => {
  const { pm, login, count } = fresh();
  const s = login(EMAILS.sourabh);
  const total = () => count('SELECT COUNT(*) AS n FROM publications');
  const before = total();
  const ids = (r) => r.duplicates.map((d) => d.publicId).sort();

  const a = { ...VALID, title: 'graph based citation analysis!', year: 2025, doiLink: '' };
  const ra = pm.addPublication(s, a);
  assert.equal(ra.result, 'DUPLICATE_WARNING');
  assert.deepEqual(ids(ra), ['P-1042', 'P-1110']);

  const rb = pm.addPublication(s, { ...VALID, title: 'A completely different title', doiLink: 'https://DOI.org/10.1109/access.2025.3361042' });
  assert.equal(rb.result, 'DUPLICATE_WARNING');
  assert.deepEqual(ids(rb), ['P-1042', 'P-1110']);
  assert.equal(total(), before, 'nothing saved for (a) and (b)');

  const rc = pm.addPublication(s, { ...a, year: 2024 });
  assert.equal(rc.result, 'SAVED');
  assert.equal(rc.publication.publicId, 'P-1120');

  const rd = pm.addPublication(s, a, true);
  assert.equal(rd.result, 'SAVED');
  assert.equal(rd.publication.publicId, 'P-1121');
  assert.equal(rd.publication.duplicateFlag, true);
});

test('TC-07 [Integration C5 → C9 → E2] submit notifies every active administrator', () => {
  const ctx = fresh();
  const { pm, login, pub, count } = ctx;
  const fs = require('fs');
  const s = login(EMAILS.sourabh);
  const pending = () => count("SELECT COUNT(*) AS n FROM notifications WHERE type = 'NEW_RECORD_PENDING'");
  const before = pending();

  const p = pm.submitForVerification(s, pub('P-1101').id);
  assert.equal(p.status, 'SUBMITTED');
  assert.equal(pending(), before + 2);

  const rows = ctx.db.prepare(
    `SELECT u.name, n.email_status AS emailStatus FROM notifications n JOIN users u ON u.user_id = n.recipient_id
     WHERE n.publication_id = ? AND n.type = 'NEW_RECORD_PENDING' ORDER BY u.name`,
  ).all(pub('P-1101').id);
  assert.deepEqual(rows.map((r) => r.name), ['Prayag Vijay', 'Pulkit Mittal']);
  assert.ok(rows.every((r) => r.emailStatus === 'SENT'));

  const mails = fs.readFileSync(ctx.services.notifier.mailLogPath, 'utf8').match(/P-1101 is waiting for verification/g) || [];
  assert.equal(mails.length, 2);
});

test('TC-08 [EP invalid class] VERIFIED record locked; other researcher refused', () => {
  const { pm, login, pub } = fresh();
  const sourabh = login(EMAILS.sourabh);
  const arjun = login(EMAILS.arjun);
  const p1042 = pub('P-1042');

  assert.equal(codeOf(() => pm.updatePublication(sourabh, p1042.id, { ...VALID, title: 'Changed' }, false, p1042.version)), 'INVALID_STATE');
  assert.equal(codeOf(() => pm.deletePublication(sourabh, p1042.id)), 'INVALID_STATE');

  let err;
  try {
    pm.updatePublication(arjun, pub('P-1101').id, { ...VALID }, false, pub('P-1101').version);
  } catch (e) {
    err = e;
  }
  assert.equal(err.code, 'ACCESS_DENIED');
  assert.equal(err.message, 'You can only view or change your own publications.');

  const after = pub('P-1042');
  assert.equal(after.status, 'VERIFIED');
  assert.equal(after.title, 'Graph-Based Citation Analysis');
  assert.equal(after.version, p1042.version);
});

test('TC-09 [System] unauthenticated, deactivated and wrong-password users', async () => {
  await withServer(async ({ call, login }) => {
    const anon = await call('POST', '/api/publications', { body: VALID });
    assert.equal(anon.status, 401);
    assert.equal(anon.body.code, 'UNAUTHENTICATED');

    const ritu = await login(EMAILS.ritu);
    assert.equal(ritu.status, 403);
    assert.equal(ritu.body.message, 'This account has been deactivated. Contact the research office.');

    const wrong = await login(EMAILS.sourabh, 'wrong-password');
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, 'The e-mail or password is incorrect.');
  });
});

// ---------------------------------------------------------------- UC-006 Verify Publication Data

test('TC-10 [System] verify a submitted record end to end (27 / 2 / 2, triggered by P-1095)', async () => {
  await withServer(async ({ call, login, pubId, db }) => {
    const admin = await login(EMAILS.prayag);
    const { id } = pubId('P-1095');

    const opened = await call('POST', `/api/verification-queue/${id}/open`, { cookie: admin.cookie });
    assert.equal(opened.status, 200);
    assert.equal(pubId('P-1095').version, opened.body.publication.version);
    const status = () => db.prepare('SELECT status FROM publications WHERE publication_id = ?').get(id).status;
    assert.equal(status(), 'UNDER_REVIEW');

    const res = await call('POST', `/api/publications/${id}/verify`, {
      cookie: admin.cookie,
      body: { comments: 'Matches publisher page', version: opened.body.publication.version },
    });
    assert.equal(res.status, 200);
    assert.equal(status(), 'VERIFIED');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM verifications WHERE publication_id = ?').get(id).n, 1);

    const researcher = await login(EMAILS.sourabh);
    const dash = await call('GET', '/api/dashboards/individual/me', { cookie: researcher.cookie });
    assert.equal(dash.body.metrics.totalCitations, 27);
    assert.equal(dash.body.metrics.hIndex, 2);
    assert.equal(dash.body.metrics.i10Index, 2);
    assert.equal(dash.body.metrics.triggeredBy, 'P-1095');

    const notes = await call('GET', '/api/notifications', { cookie: researcher.cookie });
    const list = notes.body.notifications || notes.body;
    assert.ok(list.some((n) => n.message === "P-1095 'Open Data Policies in Indian HEIs' was verified by Prayag Vijay."));
  });
});

test('TC-11 [EP + alternative flow T10] reject with blank and with real reason', () => {
  const { vm, login, pub, count, metricsOf } = fresh();
  const admin = login(EMAILS.prayag);
  const arjun = login(EMAILS.arjun);
  const p = vm.openForReview(admin, pub('P-1098').id);
  const audits = () => count("SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = 'P-1098'");
  const metricsBefore = metricsOf(arjun);

  for (const reason of ['', '   ', undefined]) {
    assert.equal(codeOf(() => vm.reject(admin, p.id, reason, p.version)), 'REASON_REQUIRED');
    assert.equal(pub('P-1098').status, 'UNDER_REVIEW');
    assert.equal(audits(), 0);
  }

  const reason = 'Venue name does not match the journal';
  vm.reject(admin, p.id, reason, p.version);
  assert.equal(pub('P-1098').status, 'REJECTED');
  assert.equal(audits(), 1);
  assert.deepEqual(metricsOf(arjun), metricsBefore, 'metrics not recomputed');
  assert.equal(
    count("SELECT COUNT(*) AS n FROM notifications WHERE type = 'PUBLICATION_REJECTED' AND message LIKE ?", `%${reason}%`),
    1,
  );
});

test('TC-12 [EP invalid class] verifying a copy of a VERIFIED record is refused', () => {
  const { vm, pm, login, pub, count } = fresh();
  const admin = login(EMAILS.prayag);
  const queue = vm.getPendingQueue(admin);
  const item = queue.pending.find((q) => q.publicId === 'P-1110');
  assert.ok(item.duplicateFlag, 'queue shows "Possible duplicate"');

  const p = vm.openForReview(admin, pub('P-1110').id);
  const detail = pm.getPublication(admin, p.id);
  assert.equal(detail.verifiedDuplicate.publicId, 'P-1042', 'W04: "Matches verified record P-1042"');

  assert.equal(codeOf(() => vm.verify(admin, p.id, '', p.version)), 'DUPLICATE_OF_VERIFIED');
  assert.equal(pub('P-1110').status, 'UNDER_REVIEW');
  assert.equal(count("SELECT COUNT(*) AS n FROM audit_logs WHERE target_id = 'P-1110'"), 0);
});

test('TC-13 [System] non-administrators cannot reach verification functions', async () => {
  await withServer(async ({ call, login, pubId }) => {
    const researcher = await login(EMAILS.sourabh);
    const hod = await login(EMAILS.lakshya);

    const q1 = await call('GET', '/api/verification-queue', { cookie: researcher.cookie });
    assert.equal(q1.status, 403);
    const v = await call('POST', `/api/publications/${pubId('P-1095').id}/verify`, { cookie: researcher.cookie, body: {} });
    assert.equal(v.status, 403);
    assert.equal(v.body.message, 'You do not have permission to verify publication data.');
    const q2 = await call('GET', '/api/verification-queue', { cookie: hod.cookie });
    assert.equal(q2.status, 403);
    const q3 = await call('GET', '/api/verification-queue');
    assert.equal(q3.status, 401);
  });
});

test('TC-14 [EP] queue lists only SUBMITTED records, oldest first', () => {
  const { vm, login } = fresh();
  const admin = login(EMAILS.prayag);
  const { pending } = vm.getPendingQueue(admin);
  assert.deepEqual(pending.map((q) => q.publicId), ['P-1095', 'P-1098', 'P-1110', 'P-1099']);
  for (const absent of ['P-1101', 'P-1104', 'P-1088']) {
    assert.ok(!pending.some((q) => q.publicId === absent), `${absent} must not be pending`);
  }
  const times = pending.map((q) => q.submittedAt);
  assert.deepEqual(times, [...times].sort());
});

test('TC-15 [Integration C6 ↔ C12] stale version and a second decision', () => {
  const { vm, login, pub, count } = fresh();
  const prayag = login(EMAILS.prayag);
  const pulkit = login(EMAILS.pulkit);
  const p = vm.openForReview(prayag, pub('P-1099').id);

  assert.equal(codeOf(() => vm.verify(prayag, p.id, '', p.version - 1)), 'CONCURRENT_UPDATE');
  vm.verify(pulkit, p.id, 'Checked', p.version);
  assert.equal(codeOf(() => vm.reject(prayag, p.id, 'Too late', p.version)), 'INVALID_STATE');
  assert.equal(count('SELECT COUNT(*) AS n FROM verifications WHERE publication_id = ?', p.id), 1);
});

test('TC-16 [Integration C6 → C10, IUnitOfWork] fault inside the decision transaction rolls everything back', () => {
  const { vm, login, pub, count, metricsOf, services } = fresh();
  const admin = login(EMAILS.prayag);
  const sourabh = login(EMAILS.sourabh);
  const p = vm.openForReview(admin, pub('P-1095').id);
  const snapshot = () => ({
    verifications: count('SELECT COUNT(*) AS n FROM verifications'),
    audit: count('SELECT COUNT(*) AS n FROM audit_logs'),
    notifications: count('SELECT COUNT(*) AS n FROM notifications'),
    citations: metricsOf(sourabh).totalCitations,
  });
  const before = snapshot();
  assert.equal(before.citations, 25);

  services.audit.record = () => { throw new Error('injected fault in AuditService.record'); };
  assert.throws(() => vm.verify(admin, p.id, '', p.version));

  assert.equal(pub('P-1095').status, 'UNDER_REVIEW');
  assert.deepEqual(snapshot(), before);
});

test('TC-17 [Integration C6 → C9 → E2] e-mail server unavailable during verification', () => {
  const { vm, login, pub, metricsOf, db } = fresh({ mailLogPath: null }); // e-mail sender disabled
  const admin = login(EMAILS.prayag);
  const sourabh = login(EMAILS.sourabh);
  const p = vm.openForReview(admin, pub('P-1095').id);

  vm.verify(admin, p.id, '', p.version);
  assert.equal(pub('P-1095').status, 'VERIFIED');
  const m = metricsOf(sourabh);
  assert.deepEqual([m.totalCitations, m.hIndex, m.i10Index], [27, 2, 2]);

  const n = db.prepare(
    "SELECT email_status AS emailStatus, attempts FROM notifications WHERE publication_id = ? AND type = 'PUBLICATION_VERIFIED'",
  ).get(p.id);
  assert.equal(n.emailStatus, 'PENDING');
  assert.equal(n.attempts, 1);
});

test('TC-18 [System] correct and resubmit a rejected record (FR-022)', async () => {
  await withServer(async ({ call, login, pubId }) => {
    const { cookie } = await login(EMAILS.sourabh);
    const { id, version } = pubId('P-1088');
    const current = (await call('GET', `/api/publications/${id}`, { cookie })).body.publication;

    const put = await call('PUT', `/api/publications/${id}`, {
      cookie,
      body: { ...current, doiLink: '10.1109/COMSNETS.2026.10881', version },
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.publication.status, 'DRAFT_ENTERED');

    const sub = await call('POST', `/api/publications/${id}/submit`, { cookie });
    assert.equal(sub.status, 200);
    assert.equal(sub.body.publication.status, 'SUBMITTED');

    const hist = await call('GET', `/api/publications/${id}/reviews`, { cookie });
    const chain = hist.body.history.map((h) => h.toStatus);
    assert.deepEqual(chain, ['DRAFT_ENTERED', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED', 'DRAFT_ENTERED', 'SUBMITTED']);
  });
});

// ---------------------------------------------------------------- UC-008 Compute Impact Metrics

const { totalCitations, hIndex, i10Index } = require('../src/domain/metrics');
const triple = (c) => [totalCitations(c), hIndex(c), i10Index(c)];

test('TC-19 [EP] worked examples of section 45.6', () => {
  assert.deepEqual(triple([14, 11]), [25, 2, 2]);
  assert.deepEqual(triple([14, 11, 2]), [27, 2, 2]);
  assert.deepEqual(triple([]), [0, 0, 0]);
});

test('TC-20 [BVA] h-index and i10-index thresholds', () => {
  assert.deepEqual([[9], [10], [11]].map(i10Index), [0, 1, 1]);
  assert.deepEqual([[0], [1], [3, 3, 2], [3, 3, 3], [4, 4, 4, 3], [100]].map(hIndex), [0, 1, 2, 3, 3, 1]);
});

test('TC-21 [EP] only VERIFIED records feed the metrics (BR-002)', () => {
  const { services, login } = fresh();
  const s = login(EMAILS.sourabh);
  const m = services.metrics.recompute(s.userId, 'TC-21');
  assert.deepEqual([m.totalCitations, m.hIndex, m.i10Index, m.verifiedCount], [25, 2, 2, 2]);
  const counted = services.repos.publications.findVerifiedByOwner(s.userId).map((p) => p.publicId).sort();
  assert.deepEqual(counted, ['P-0987', 'P-1042']);
});

test('TC-22 [System] dashboard after a verification shows 27 / 2 / 2 and the trigger', async () => {
  await withServer(async ({ call, login, pubId }) => {
    const admin = await login(EMAILS.prayag);
    const { id } = pubId('P-1095');
    const opened = await call('POST', `/api/verification-queue/${id}/open`, { cookie: admin.cookie });
    await call('POST', `/api/publications/${id}/verify`, { cookie: admin.cookie, body: { version: opened.body.publication.version } });

    const researcher = await login(EMAILS.sourabh);
    const view = (await call('GET', '/api/dashboards/individual/me', { cookie: researcher.cookie })).body;
    assert.deepEqual(
      [view.metrics.totalCitations, view.metrics.hIndex, view.metrics.i10Index, view.metrics.verifiedCount, view.metrics.triggeredBy],
      [27, 2, 2, 3, 'P-1095'],
    );
    assert.equal(view.trend['2024'], 1);
    assert.equal(view.trend['2025'], 2);
    assert.equal(view.trend[String(CY)], 0);
    assert.deepEqual(view.rankedVerified.map((r) => `${r.publicId}:${r.citations}`), ['P-0987:14', 'P-1042:11', 'P-1095:2']);

    const asAdmin = await call('GET', `/api/dashboards/individual/${researcher.body.user.id}`, { cookie: admin.cookie });
    assert.equal(asAdmin.status, 200);
  });
});

test('TC-23 [EP invalid class] another researcher cannot see the metrics (AC-14)', async () => {
  await withServer(async ({ call, login }) => {
    const sourabh = await login(EMAILS.sourabh);
    const id = sourabh.body.user.id;
    const arjun = await login(EMAILS.arjun);
    const hod = await login(EMAILS.lakshya);

    const other = await call('GET', `/api/dashboards/individual/${id}`, { cookie: arjun.cookie });
    assert.equal(other.status, 403);
    assert.equal(other.body.code, 'ACCESS_DENIED');
    assert.equal((await call('GET', `/api/dashboards/individual/${id}`, { cookie: hod.cookie })).status, 403);
    assert.equal((await call('GET', `/api/dashboards/individual/${id}`)).status, 401);
  });
});

test('TC-24 [BVA] researcher with no verified publication → 0 / 0 / 0', () => {
  const { services, db, login } = fresh();
  const s = login(EMAILS.sourabh);
  const dept = db.prepare('SELECT department_id AS id FROM users WHERE user_id = ?').get(s.userId).id;
  const hash = db.prepare('SELECT password_hash AS h FROM users WHERE user_id = ?').get(s.userId).h;
  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, department_id, designation)
     VALUES ('Dr. New Researcher', 'new.researcher@lnmiit.ac.in', ?, 'RESEARCHER', ?, 'Assistant Professor')`,
  ).run(hash, dept);
  const fresher = login('new.researcher@lnmiit.ac.in');

  const m = services.metrics.recompute(fresher.userId, 'TC-24');
  assert.deepEqual([m.totalCitations, m.hIndex, m.i10Index, m.verifiedCount], [0, 0, 0, 0]);
  const view = services.dashboards.getIndividualView(fresher, 'me');
  assert.deepEqual(view.rankedVerified, []);
  assert.ok(Object.values(view.trend).every((v) => v === 0));
});

test('TC-25 [System, BR-006] HoD summary aggregates only the HoD\'s own department', async () => {
  await withServer(async ({ call, login, pubId }) => {
    // Precondition as executed in the document: P-1095 verified (TC-10), so CSE has 4 verified records.
    const admin = await login(EMAILS.prayag);
    const { id } = pubId('P-1095');
    const opened = await call('POST', `/api/verification-queue/${id}/open`, { cookie: admin.cookie });
    await call('POST', `/api/publications/${id}/verify`, { cookie: admin.cookie, body: { version: opened.body.publication.version } });

    const cse = (await call('GET', '/api/dashboards/department', { cookie: (await login(EMAILS.lakshya)).cookie })).body;
    assert.equal(cse.department.code, 'CSE');
    assert.deepEqual([cse.verifiedCount, cse.totalCitations, cse.researcherCount], [4, 36, 2]);

    const ece = (await call('GET', '/api/dashboards/department', { cookie: (await login(KARTIK)).cookie })).body;
    assert.equal(ece.department.code, 'ECE');
    assert.deepEqual([ece.verifiedCount, ece.totalCitations], [2, 28]);

    const researcher = await call('GET', '/api/dashboards/department', { cookie: (await login(EMAILS.sourabh)).cookie });
    assert.equal(researcher.status, 403);
  });
});

