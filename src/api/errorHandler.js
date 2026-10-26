'use strict';
const { AppError, HTTP_STATUS, MESSAGES } = require('../domain/errors');

/** Maps AppError codes to HTTP status + JSON (SRS 44.4). Stack traces go to the console, never to the client. */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    const body = { code: err.code, message: err.message };
    if (err.extra && err.extra.fieldErrors) body.fieldErrors = err.extra.fieldErrors;
    if (err.extra && err.extra.duplicates) body.duplicates = err.extra.duplicates;
    if (err.extra && err.extra.duplicate) body.duplicate = err.extra.duplicate;
    return res.status(HTTP_STATUS[err.code] || 400).json(body);
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'BAD_REQUEST', message: 'The request could not be read.' });
  }
  console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  return res.status(503).json({ code: 'PERSISTENCE_FAILURE', message: MESSAGES.REQUEST_FAILED });
}

module.exports = { errorHandler };
