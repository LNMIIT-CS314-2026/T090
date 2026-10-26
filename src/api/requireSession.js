'use strict';
const { AppError, MESSAGES } = require('../domain/errors');

const COOKIE_NAME = 'rp_session';

/** rp_session cookie → req.session (401 UNAUTHENTICATED if missing or expired). */
function makeRequireSession(auth) {
  return function requireSession(req, res, next) {
    try {
      req.session = auth.authenticate(req.cookies[COOKIE_NAME]);
      next();
    } catch (err) {
      res.clearCookie(COOKIE_NAME, { path: '/' });
      next(err);
    }
  };
}

/** Parses a numeric :id path parameter; anything else is treated as "not found". */
function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('NOT_FOUND', MESSAGES.PUBLICATION_NOT_FOUND);
  return n;
}

module.exports = { makeRequireSession, parseId, COOKIE_NAME };
