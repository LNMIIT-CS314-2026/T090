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

  // Summary of the HoD's own department (read-only, BR-006).
  router.get('/dashboards/department', (req, res) => {
    res.json(ds.getDepartmentSummary(req.session));
  });

  // FR-029 department dashboard (':id' or 'mine'), FR-030 institute dashboard, FR-031 comparison; FR-033 filters.
  router.get('/dashboards/department/:id', (req, res) => {
    const raw = req.params.id;
    if (raw !== 'mine' && !/^\d+$/.test(raw)) throw new AppError('NOT_FOUND', MESSAGES.DEPARTMENT_NOT_FOUND);
    res.json(ds.getDepartmentView(req.session, raw === 'mine' ? 'mine' : Number(raw), req.query));
  });

  router.get('/dashboards/institute', (req, res) => {
    res.json(ds.getInstituteView(req.session, req.query));
  });

  router.get('/dashboards/compare', (req, res) => {
    res.json(ds.getComparison(req.session, req.query));
  });

  router.get('/departments', (req, res) => {
    res.json({ departments: ds.listDepartments(req.session) });
  });

  return router;
}

module.exports = { dashboardRoutes };
