'use strict';
const express = require('express');
const { parseId } = require('./requireSession');
const { MESSAGES } = require('../domain/errors');

/** Translates an AddPublicationResult into a response: 201/200 SAVED, 422 VALIDATION_FAILED, 409 DUPLICATE_WARNING. */
function sendResult(res, result, okStatus) {
  if (result.result === 'VALIDATION_FAILED') {
    return res.status(422).json({
      code: 'VALIDATION_FAILED',
      message: MESSAGES.validationSummary(Object.keys(result.errors).length),
      fieldErrors: result.errors,
    });
  }
  if (result.result === 'DUPLICATE_WARNING') {
    return res.status(409).json({
      code: 'DUPLICATE_WARNING',
      message: MESSAGES.duplicateWarning(result.duplicates.map((d) => d.publicId)),
      duplicates: result.duplicates,
    });
  }
  return res.status(okStatus).json({ result: 'SAVED', publication: result.publication });
}

function publicationRoutes(services) {
  const router = express.Router();
  const pm = services.publications;

  router.get('/publications', (req, res) => {
    res.json({ publications: pm.getMyPublications(req.session, req.query) });
  });

  router.post('/publications', (req, res) => {
    const result = pm.addPublication(req.session, req.body || {}, req.query.confirmDuplicate === 'true');
    sendResult(res, result, 201);
  });

  router.get('/publications/:id', (req, res) => {
    res.json({ publication: pm.getPublication(req.session, parseId(req.params.id)) });
  });

  router.put('/publications/:id', (req, res) => {
    const body = req.body || {};
    const result = pm.updatePublication(req.session, parseId(req.params.id), body, req.query.confirmDuplicate === 'true', body.version);
    sendResult(res, result, 200);
  });

  router.delete('/publications/:id', (req, res) => {
    pm.deletePublication(req.session, parseId(req.params.id));
    res.status(204).end();
  });

  router.post('/publications/:id/submit', (req, res) => {
    res.json({ publication: pm.submitForVerification(req.session, parseId(req.params.id)) });
  });

  router.get('/publications/:id/reviews', (req, res) => {
    res.json(pm.getReviewHistory(req.session, parseId(req.params.id)));
  });

  return router;
}

module.exports = { publicationRoutes };
