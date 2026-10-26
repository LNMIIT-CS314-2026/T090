'use strict';
const express = require('express');
const { parseId } = require('./requireSession');

function verificationRoutes(services) {
  const router = express.Router();
  const vm = services.verification;

  router.get('/verification-queue', (req, res) => {
    res.json(vm.getPendingQueue(req.session, req.query));
  });

  router.post('/verification-queue/:id/open', (req, res) => {
    res.json({ publication: vm.openForReview(req.session, parseId(req.params.id)) });
  });

  router.post('/publications/:id/verify', (req, res) => {
    const { comments, version } = req.body || {};
    res.json(vm.verify(req.session, parseId(req.params.id), comments, version));
  });

  router.post('/publications/:id/reject', (req, res) => {
    const { reason, version } = req.body || {};
    res.json(vm.reject(req.session, parseId(req.params.id), reason, version));
  });

  return router;
}

module.exports = { verificationRoutes };
