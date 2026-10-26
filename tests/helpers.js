'use strict';
// Shared test setup: in-memory database with schema + seed, services wired as in the app.
const os = require('os');
const path = require('path');
const { openDb } = require('../src/db/connection');
const { seed } = require('../src/db/seed');
const { buildServices } = require('../src/services');

function mailLogPath() {
  return path.join(os.tmpdir(), `researchpulse-test-mail-${process.pid}-${Date.now()}.log`);
}

function createContext() {
  const db = openDb(':memory:');
  seed(db);
  const services = buildServices(db, { mailLogPath: mailLogPath(), quiet: true });
  const login = (email) => services.auth.login(email, 'demo123').session;
  const pubId = (publicId) => services.repos.publications.findByPublicId(publicId);
  return { db, services, login, pubId };
}

const EMAILS = {
  sourabh: 'sourabh@lnmiit.ac.in',
  prayag: 'prayag.vijay@lnmiit.ac.in',
  pulkit: 'pulkit.mittal@lnmiit.ac.in',
  lakshya: 'lakshya.singhal@lnmiit.ac.in',
  arjun: 'arjun.bhatt@lnmiit.ac.in',
  ritu: 'ritu.saxena@lnmiit.ac.in',
};

module.exports = { createContext, mailLogPath, EMAILS };
