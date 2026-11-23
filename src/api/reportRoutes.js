'use strict';
const express = require('express');
const { AppError, MESSAGES } = require('../domain/errors');

function reportId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('NOT_FOUND', MESSAGES.REPORT_NOT_FOUND);
  return n;
}

/** Reports (FR-034, FR-035) and export (FR-036). */
function reportRoutes(services) {
  const router = express.Router();
  const rs = services.reports;

  router.get('/reports', (req, res) => {
    res.json({ reports: rs.list(req.session) });
  });

  router.post('/reports', (req, res) => {
    res.status(201).json({ report: rs.generate(req.session, req.body || {}) });
  });

  router.get('/reports/:id', (req, res) => {
    res.json({ report: rs.get(req.session, reportId(req.params.id)) });
  });

  router.get('/reports/:id/export.csv', (req, res) => {
    const { filename, csv } = rs.exportCsv(req.session, reportId(req.params.id));
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    res.type('text/csv; charset=utf-8').send(csv);
  });

  return router;
}

module.exports = { reportRoutes };
