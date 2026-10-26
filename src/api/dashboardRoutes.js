'use strict';
const express = require('express');
const { AppError, MESSAGES } = require('../domain/errors');

function dashboardRoutes(services) {
  const router = express.Router();
  const ds = services.dashboards;

  router.get('/dashboards/individual/:researcherId', (req, res) => {
    const raw = req.params.researcherId;
    if (raw !== 'me' && !/^\d+$/.test(raw)) throw new AppError('NOT_FOUND', MESSAGES.RESEARCHER_NOT_FOUND);
    res.json(ds.getIndividualView(req.session, raw === 'me' ? 'me' : Number(raw)));
  });

  // HoD home summary of the HoD's own department (read-only, BR-006).
  router.get('/dashboards/department', (req, res) => {
    res.json(ds.getDepartmentSummary(req.session));
  });

  router.get('/departments', (req, res) => {
    res.json({ departments: ds.listDepartments(req.session) });
  });

  return router;
}

module.exports = { dashboardRoutes };
