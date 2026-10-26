'use strict';
// REST API over HTTP (createApp(db).listen(0) + global fetch).
const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const { createApp } = require('../src/app');
const { mailLogPath, EMAILS } = require('./helpers');

let server;
let base;

test.before(async () => {
  const db = openDb(':memory:');
  seed(db);
  const app = createApp(db, { mailLogPath: mailLogPath(), quiet: true });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, { body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

async function login(email, password = 'demo123') {
  const res = await call('POST', '/api/auth/login', { body: { email, password } });
  const setCookie = res.headers.get('set-cookie') || '';
  return { ...res, cookie: setCookie.split(';')[0] };
}

test('wrong password and unknown e-mail give the same 401 message (FR-002)', async () => {
  const wrong = await login(EMAILS.sourabh, 'wrong-password');
  const unknown = await login('nobody@lnmiit.ac.in');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, 'The e-mail or password is incorrect.');
  assert.deepEqual(wrong.body, unknown.body);
});

test('a deactivated account gets 403 (BR-009)', async () => {
  const res = await login(EMAILS.ritu);
  assert.equal(res.status, 403);
  assert.equal(res.body.message, 'This account has been deactivated. Contact the research office.');
});

test('no cookie → 401 on protected endpoints', async () => {
  for (const path of ['/api/auth/me', '/api/publications', '/api/verification-queue', '/api/notifications']) {
    const res = await call('GET', path);
    assert.equal(res.status, 401, path);
    assert.equal(res.body.code, 'UNAUTHENTICATED');
  }
});

test('a researcher calling the verification queue gets 403 (BR-005)', async () => {
  const { cookie } = await login(EMAILS.sourabh);
  const res = await call('GET', '/api/verification-queue', { cookie });
  assert.equal(res.status, 403);
  assert.equal(res.body.message, 'You do not have permission to verify publication data.');
  const verify = await call('POST', '/api/publications/1/verify', { cookie, body: {} });
  assert.equal(verify.status, 403);
});

test('validation and duplicate responses use 422 and 409', async () => {
  const { cookie } = await login(EMAILS.sourabh);
  const invalid = await call('POST', '/api/publications', { cookie, body: { title: '', year: 2030 } });
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.code, 'VALIDATION_FAILED');
  assert.equal(invalid.body.message, 'Please correct 4 fields. Nothing has been saved yet.');
  assert.equal(invalid.body.fieldErrors.year, `Enter a year between 1900 and ${new Date().getFullYear()}.`);

  const dup = await call('POST', '/api/publications?confirmDuplicate=false', {
    cookie, body: { title: 'Graph-Based Citation Analysis', authors: 'Sourabh', publicationType: 'JOURNAL', year: 2025 },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE_WARNING');
  assert.deepEqual(dup.body.duplicates.map((d) => d.publicId), ['P-1042', 'P-1110']);
});

test('full happy path: researcher add → submit, admin open → verify, dashboard shows new metrics', async () => {
  const researcher = await login(EMAILS.sourabh);
  assert.equal(researcher.status, 200);
  assert.equal(researcher.body.home, '/researcher/dashboard');

  const before = await call('GET', '/api/dashboards/individual/me', { cookie: researcher.cookie });
  assert.equal(before.body.metrics.totalCitations, 25);

  const add = await call('POST', '/api/publications', {
    cookie: researcher.cookie,
    body: { title: 'Measuring Research Impact in Indian Universities', authors: 'Sourabh, K. Rao', publicationType: 'JOURNAL', venue: 'Current Science', year: 2026, citationCount: 12 },
  });
  assert.equal(add.status, 201);
  assert.equal(add.body.publication.publicId, 'P-1120');
  const id = add.body.publication.id;

  const submit = await call('POST', `/api/publications/${id}/submit`, { cookie: researcher.cookie });
  assert.equal(submit.status, 200);
  assert.equal(submit.body.publication.status, 'SUBMITTED');

  const admin = await login(EMAILS.prayag);
  assert.equal(admin.body.home, '/admin/queue');
  const queue = await call('GET', '/api/verification-queue', { cookie: admin.cookie });
  assert.ok(queue.body.pending.some((p) => p.id === id));

  const open = await call('POST', `/api/verification-queue/${id}/open`, { cookie: admin.cookie });
  assert.equal(open.body.publication.status, 'UNDER_REVIEW');

  const emptyReject = await call('POST', `/api/publications/${id}/reject`, { cookie: admin.cookie, body: { reason: '' } });
  assert.equal(emptyReject.status, 422);
  assert.equal(emptyReject.body.message, 'A rejection reason is required.');

  const verify = await call('POST', `/api/publications/${id}/verify`, {
    cookie: admin.cookie, body: { comments: 'Checked against the journal site', version: open.body.publication.version },
  });
  assert.equal(verify.status, 200);
  assert.deepEqual(
    { c: verify.body.metrics.totalCitations, h: verify.body.metrics.hIndex, i: verify.body.metrics.i10Index },
    { c: 37, h: 3, i: 3 }
  );

  const again = await call('POST', `/api/publications/${id}/verify`, { cookie: admin.cookie, body: {} });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'INVALID_STATE');

  const after = await call('GET', '/api/dashboards/individual/me', { cookie: researcher.cookie });
  assert.equal(after.body.metrics.totalCitations, 37);
  assert.equal(after.body.metrics.hIndex, 3);
  assert.equal(after.body.metrics.triggeredBy, 'P-1120');

  const notes = await call('GET', '/api/notifications', { cookie: researcher.cookie });
  assert.equal(notes.body.notifications[0].type, 'PUBLICATION_VERIFIED');
  assert.ok(notes.body.unreadCount >= 1);
});

test('a researcher cannot read another researcher’s dashboard or record (AC-14)', async () => {
  const { cookie } = await login(EMAILS.arjun);
  const dash = await call('GET', '/api/dashboards/individual/1', { cookie });
  assert.equal(dash.status, 403);
  const rec = await call('GET', '/api/publications/1', { cookie });
  assert.equal(rec.status, 403);
});

test('logout ends the session', async () => {
  const { cookie } = await login(EMAILS.lakshya);
  assert.equal((await call('GET', '/api/dashboards/department', { cookie })).status, 200);
  assert.equal((await call('POST', '/api/auth/logout', { cookie })).status, 204);
  assert.equal((await call('GET', '/api/auth/me', { cookie })).status, 401);
});
