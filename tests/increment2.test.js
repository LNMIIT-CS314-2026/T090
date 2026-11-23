'use strict';
// Second increment: the FRs that were outside the first prototype. TC-27 – TC-29 are the test cases of
// A8 section 48.2 that were "Not Executed"; the other cases cover the new FRs. Fresh demo data per test.
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const { buildServices } = require('../src/services');
const { createApp } = require('../src/app');
const { parseCsv, toCsv } = require('../src/domain/csv');
const { milestones } = require('../src/domain/metrics');
const { mailLogPath, EMAILS } = require('./helpers');

const DEAN = 'meenakshi.rao@lnmiit.ac.in';
const SYSADMIN = 'vikram.joshi@lnmiit.ac.in';
const KARTIK = 'kartik.mantri@lnmiit.ac.in';
const CY = new Date().getFullYear();

function fresh() {
  const db = openDb(':memory:');
  seed(db);
  const s = buildServices(db, { mailLogPath: mailLogPath(), quiet: true });
  const login = (email) => s.auth.login(email, 'demo123').session;
  const pub = (publicId) => s.repos.publications.findByPublicId(publicId);
  const verify = (publicId) => {
    const admin = login(EMAILS.prayag);
    const p = s.verification.openForReview(admin, pub(publicId).id);
    return s.verification.verify(admin, p.id, '', p.version);
  };
  return { db, s, login, pub, verify };
}

function codeOf(fn) {
  try { fn(); } catch (err) { return err.code; }
  return 'NO_ERROR';
}

const SAMPLE = [
  'title,authors,type,venue,year,doi,citations',
  '"Citation Gaps in Indian Engineering Theses","Sourabh, A. Gupta",Journal article,Scientometrics,2026,10.1007/s11192-026-04411,1',
  '"Linking Institutional Repositories with ORCID","Sourabh, R. Jain",Conference paper,JCDL,2025,,4',
  '"Research Data Management: A Practical Guide","Sourabh, P. Verma",Book chapter,"Springer — Open Science in Asia",2024,,6',
  '"Untitled draft without a year","Sourabh",Journal article,,,,',
].join('\r\n');

// ---------------------------------------------------------------- A8 TC-27 – TC-29, now executable

test('TC-27 [System, FR-029, FR-030] department and institute dashboards include a new verification', () => {
  const { login, verify, s } = fresh();
  const dean = login(DEAN);
  const before = s.dashboards.getInstituteView(dean);
  const cseBefore = s.dashboards.getDepartmentView(dean, 1);
  verify('P-1095'); // 2 citations, CSE
  const after = s.dashboards.getInstituteView(dean);
  const cseAfter = s.dashboards.getDepartmentView(dean, 1);
  assert.equal(after.totals.citations, before.totals.citations + 2);
  assert.equal(after.totals.publications, before.totals.publications + 1);
  assert.equal(cseAfter.totals.citations, cseBefore.totals.citations + 2);
  assert.deepEqual([cseAfter.totals.publications, cseAfter.totals.citations], [4, 36]);
});

test('TC-28 [System, FR-014, FR-015] import a CSV with 3 valid rows and 1 invalid row', () => {
  const { s, login } = fresh();
  const r = login(EMAILS.sourabh);
  const preview = s.importer.preview(r, SAMPLE);
  assert.deepEqual(preview.counts, { ok: 3, duplicate: 0, invalid: 1 });
  const bad = preview.rows.find((x) => x.status === 'INVALID');
  assert.equal(bad.line, 5);
  assert.equal(bad.errors.year, 'Year is required.');

  const res = s.importer.import(r, SAMPLE);
  assert.deepEqual(res.imported.map((x) => x.publicId), ['P-1120', 'P-1121', 'P-1122']);
  assert.equal(res.skipped.length, 1);
  for (const x of res.imported) assert.equal(s.repos.publications.findById(x.id).status, 'DRAFT_ENTERED');
  assert.equal(s.repos.publications.findByPublicId('P-1122').publicationType, 'BOOK_CHAPTER');
});

test('TC-29 [System, FR-034, BR-007] accreditation report from verified data only; researcher refused', async () => {
  const { s, login } = fresh();
  const admin = login(EMAILS.prayag);
  const r = s.reports.generate(admin, { type: 'ACCREDITATION', departmentId: 1, yearFrom: 2025, yearTo: 2025 });
  assert.equal(r.publicId, 'R-0001');
  const ids = r.content.publications.map((p) => p.publicId).sort();
  assert.deepEqual(ids, ['P-1042', 'P-1060']); // CSE, VERIFIED, 2025; P-1095 / P-1110 (not verified) excluded
  assert.equal(r.content.totals.citations, 20);

  assert.equal(codeOf(() => s.reports.generate(login(EMAILS.sourabh), { type: 'ACCREDITATION', yearFrom: 2024, yearTo: 2025 })), 'ACCESS_DENIED');
  assert.equal(codeOf(() => s.reports.generate(login(EMAILS.lakshya), { type: 'ACCREDITATION', yearFrom: 2024, yearTo: 2025 })), 'ACCESS_DENIED');
});

// ---------------------------------------------------------------- dashboards, comparison, filters

test('FR-029 / BR-006: a HoD sees only their own department', () => {
  const { s, login } = fresh();
  const hod = login(EMAILS.lakshya);
  const v = s.dashboards.getDepartmentView(hod, 'mine');
  assert.equal(v.department.code, 'CSE');
  assert.deepEqual([v.totals.researcherCount, v.totals.publications, v.totals.citations], [2, 3, 34]);
  assert.equal(codeOf(() => s.dashboards.getDepartmentView(hod, 2)), 'ACCESS_DENIED');
  assert.equal(codeOf(() => s.dashboards.getInstituteView(hod)), 'ACCESS_DENIED');
  assert.equal(codeOf(() => s.dashboards.getDepartmentView(login(EMAILS.sourabh), 1)), 'ACCESS_DENIED');
});

test('FR-033: filter by year range and researcher', () => {
  const { s, login } = fresh();
  const dean = login(DEAN);
  const only2024 = s.dashboards.getDepartmentView(dean, 1, { yearFrom: '2024', yearTo: '2024' });
  assert.deepEqual(only2024.publications.map((p) => p.publicId), ['P-0987']);
  assert.deepEqual(Object.keys(only2024.trend), ['2024']);
  const arjun = s.dashboards.getDepartmentView(dean, 1, { researcherId: '7' });
  assert.deepEqual(arjun.publications.map((p) => p.publicId), ['P-1060']);
  assert.equal(codeOf(() => s.dashboards.getDepartmentView(dean, 1, { yearFrom: '2026', yearTo: '2024' })), 'VALIDATION_FAILED');
  assert.equal(codeOf(() => s.dashboards.getDepartmentView(dean, 1, { yearTo: String(CY + 1) })), 'VALIDATION_FAILED');
  const ece = s.dashboards.getInstituteView(dean, { departmentId: '2' });
  assert.deepEqual(ece.departments.map((d) => d.code), ['ECE']);
  assert.equal(ece.totals.citations, 28);
});

test('FR-031: compare researchers and departments; a HoD compares own researchers only', () => {
  const { s, login } = fresh();
  const dean = login(DEAN);
  const depts = s.dashboards.getComparison(dean, { mode: 'departments', ids: '1,2,3' });
  assert.deepEqual(depts.rows.map((r) => [r.group, r.publications, r.citations]), [['CSE', 3, 34], ['ECE', 2, 28], ['MTH', 1, 6]]);

  const hod = login(EMAILS.lakshya);
  const own = s.dashboards.getComparison(hod, { ids: '1,7' });
  assert.deepEqual(own.rows.map((r) => [r.label, r.citations, r.hIndex]), [['Dr. Sourabh', 25, 2], ['Dr. Arjun Bhatt', 9, 1]]);
  assert.equal(codeOf(() => s.dashboards.getComparison(hod, { ids: '1,6' })), 'ACCESS_DENIED'); // 6 = Neha (ECE)
  assert.equal(codeOf(() => s.dashboards.getComparison(hod, { mode: 'departments', ids: '1,2' })), 'ACCESS_DENIED');
});

// ---------------------------------------------------------------- import details

test('FR-014 / FR-016: duplicates against own records and inside the file', () => {
  const { s, login } = fresh();
  const r = login(EMAILS.sourabh);
  const csv = [
    'Title,Author,Publication type,Year,DOI',
    'Graph-Based Citation Analysis,Sourabh,Journal,2025,',
    'A New Paper on Theses,Sourabh,Journal,2026,10.1000/new.1',
    'A new paper on theses!,Sourabh,Journal,2026,',
  ].join('\n');
  const p = s.importer.preview(r, csv);
  assert.deepEqual(p.rows.map((x) => x.status), ['DUPLICATE', 'OK', 'DUPLICATE']);
  assert.match(p.rows[0].message, /P-1042/);
  assert.match(p.rows[2].message, /line 3/);
  assert.equal(s.importer.import(r, csv).imported.length, 1);
  const withDup = s.importer.import(r, csv, true);
  assert.ok(withDup.imported.every((x) => x.duplicateFlag));
});

test('FR-015: missing columns, empty file, wrong role', () => {
  const { s, login } = fresh();
  const r = login(EMAILS.sourabh);
  let err;
  try { s.importer.preview(r, 'title,year\nX,2024'); } catch (e) { err = e; }
  assert.equal(err.code, 'VALIDATION_FAILED');
  assert.match(err.message, /authors, type/);
  assert.equal(codeOf(() => s.importer.preview(r, 'title,authors,type,year\n')), 'VALIDATION_FAILED');
  assert.equal(codeOf(() => s.importer.preview(login(EMAILS.prayag), SAMPLE)), 'ACCESS_DENIED');
});

test('CSV reader and writer handle quotes, commas and new lines', () => {
  const rows = [['a', 'b, c', 'say "hi"', 'two\nlines', '']];
  const parsed = parseCsv(toCsv(rows));
  assert.deepEqual(parsed[0].cells, rows[0]);
});

// ---------------------------------------------------------------- reports

test('FR-035 / FR-036: department report for a HoD, CSV export, access to other departments refused', () => {
  const { s, login } = fresh();
  const hod = login(EMAILS.lakshya);
  const r = s.reports.generate(hod, { type: 'DEPARTMENT', yearFrom: 2020, yearTo: CY });
  assert.equal(r.departmentCode, 'CSE');
  assert.deepEqual(r.content.groups.map((g) => g.label.split(',')[0]), ['Dr. Sourabh', 'Dr. Arjun Bhatt']);
  const { filename, csv } = s.reports.exportCsv(hod, r.id);
  assert.equal(filename, 'R-0001-department-cse.csv');
  assert.match(csv, /^﻿ResearchPulse,Department research summary/);
  assert.match(csv, /P-1042,Graph-Based Citation Analysis/);

  const ece = s.reports.generate(login(KARTIK), { type: 'DEPARTMENT', yearFrom: 2020, yearTo: CY });
  assert.equal(codeOf(() => s.reports.get(hod, ece.id)), 'ACCESS_DENIED');
  assert.deepEqual(s.reports.list(hod).map((x) => x.publicId), ['R-0001']);
  assert.equal(codeOf(() => s.reports.generate(hod, { type: 'DEPARTMENT', departmentId: 2, yearFrom: 2020, yearTo: CY })), 'ACCESS_DENIED');
  assert.equal(codeOf(() => s.reports.generate(login(DEAN), { type: 'DEPARTMENT', yearFrom: 2020, yearTo: CY })), 'VALIDATION_FAILED');
});

test('FR-036 over HTTP: CSV download with attachment header', async () => {
  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db, { mailLogPath: mailLogPath(), quiet: true });
  const server = await new Promise((resolve) => { const sv = app.listen(0, () => resolve(sv)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: DEAN, password: 'demo123' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await login.json()).home, '/dashboards/institute');
    const gen = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ type: 'ACCREDITATION', yearFrom: 2023, yearTo: CY }) });
    assert.equal(gen.status, 201);
    const { report } = await gen.json();
    const res = await fetch(`${base}/api/reports/${report.id}/export.csv`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="R-0001-accreditation.csv"/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ---------------------------------------------------------------- users, profile, roles

test('FR-006 / FR-007: a researcher edits their profile; bad values refused', () => {
  const { s, login } = fresh();
  const r = login(EMAILS.sourabh);
  assert.equal(s.accounts.getProfile(r).researchAreas, 'Bibliometrics, scholarly data pipelines, citation analysis');
  const p = s.accounts.updateProfile(r, { name: 'Dr. Sourabh', designation: 'Professor', researchAreas: 'Scientometrics', phone: '+91 98290 12345' });
  assert.deepEqual([p.designation, p.researchAreas, p.phone, p.email], ['Professor', 'Scientometrics', '+91 98290 12345', 'sourabh@lnmiit.ac.in']);
  let err;
  try { s.accounts.updateProfile(r, { name: '', phone: 'call me' }); } catch (e) { err = e; }
  assert.equal(err.code, 'VALIDATION_FAILED');
  assert.deepEqual(Object.keys(err.extra.fieldErrors).sort(), ['name', 'phone']);
});

test('FR-004 / FR-009: system administrator creates users, changes roles, deactivates; all audited', () => {
  const { s, login, db } = fresh();
  const sys = login(SYSADMIN);
  const u = s.accounts.createUser(sys, { name: 'Dr. Kavya Menon', email: 'kavya.menon@lnmiit.ac.in', role: 'RESEARCHER', departmentId: 3, designation: 'Assistant Professor', password: 'welcome-2026' });
  assert.equal(u.departmentCode, 'MTH');
  assert.equal(s.auth.login('kavya.menon@lnmiit.ac.in', 'welcome-2026').user.role, 'RESEARCHER');
  assert.equal(codeOf(() => s.accounts.createUser(sys, { name: 'X', email: 'KAVYA.menon@lnmiit.ac.in', role: 'RESEARCHER', departmentId: 3, password: 'welcome-2026' })), 'VALIDATION_FAILED');

  // MTH already has an active head (Dr. Anjali Verma): a second one is refused. After she is
  // deactivated, Kavya can become head of MTH.
  assert.equal(codeOf(() => s.accounts.changeRole(sys, u.id, { role: 'HOD', departmentId: 3 })), 'INVALID_STATE');
  const anjali = s.users.findUserByEmail('anjali.verma@lnmiit.ac.in');
  s.accounts.setAccountStatus(sys, anjali.id, 'DEACTIVATED');
  assert.equal(s.accounts.changeRole(sys, u.id, { role: 'HOD', departmentId: 3 }).role, 'HOD');
  assert.equal(db.prepare('SELECT head_user_id AS h FROM departments WHERE code = ?').get('MTH').h, u.id);

  // A researcher with publications keeps the role; own account cannot be changed.
  assert.equal(codeOf(() => s.accounts.changeRole(sys, 1, { role: 'RESEARCH_ADMIN' })), 'INVALID_STATE');
  const sysId = s.auth.authorize(sys, 'SYSTEM_ADMIN').id;
  assert.equal(codeOf(() => s.accounts.setAccountStatus(sys, sysId, 'DEACTIVATED')), 'INVALID_STATE');

  // Deactivation ends the session and blocks login (BR-009); reactivation restores it.
  const arjun = login(EMAILS.arjun);
  s.accounts.setAccountStatus(sys, arjun.userId, 'DEACTIVATED');
  assert.equal(codeOf(() => s.auth.authenticate(arjun.token)), 'UNAUTHENTICATED');
  assert.equal(codeOf(() => login(EMAILS.arjun)), 'ACCESS_DENIED');
  s.accounts.setAccountStatus(sys, arjun.userId, 'ACTIVE');
  assert.ok(login(EMAILS.arjun));

  const actions = db.prepare("SELECT action FROM audit_logs WHERE target_id LIKE 'U-%' ORDER BY log_id").all().map((r) => r.action);
  assert.deepEqual(actions, ['CREATE_USER', 'DEACTIVATE', 'CHANGE_ROLE', 'DEACTIVATE', 'ACTIVATE']);
  assert.equal(codeOf(() => s.accounts.listUsers(login(EMAILS.prayag))), 'ACCESS_DENIED');
});

// ---------------------------------------------------------------- milestone notifications

test('FR-038: milestone notifications when h-index or i10-index rises', () => {
  assert.deepEqual(milestones({ totalCitations: 25, hIndex: 2, i10Index: 2 }, { totalCitations: 27, hIndex: 2, i10Index: 2 }), []);
  assert.deepEqual(milestones({ totalCitations: 40, hIndex: 2, i10Index: 1 }, { totalCitations: 120, hIndex: 3, i10Index: 2 }), [
    'Your h-index rose from 2 to 3.',
    'Your i10-index rose from 1 to 2.',
    'Your verified publications have reached 100 citations.',
  ]);

  const { s, login, verify, db } = fresh();
  const arjun = login(EMAILS.arjun);
  const admin = login(EMAILS.pulkit);
  const p = s.repos.publications.findByPublicId('P-1104'); // 27 citations, UNDER_REVIEW by Pulkit
  s.verification.verify(admin, p.id, '', p.version);
  const notes = db.prepare("SELECT message FROM notifications WHERE recipient_id = ? AND type = 'MILESTONE' ORDER BY notification_id").all(arjun.userId).map((r) => r.message);
  assert.deepEqual(notes, [
    'Your h-index rose from 1 to 2. (after P-1104 was verified)',
    'Your i10-index rose from 0 to 1. (after P-1104 was verified)',
  ]);
  verify('P-1095'); // Dr. Sourabh: 25 → 27, no milestone
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = 1 AND type = 'MILESTONE'").get().n, 0);
});
