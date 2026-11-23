'use strict';
const express = require('express');
const { AppError, MESSAGES } = require('../domain/errors');

function userId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError('NOT_FOUND', MESSAGES.USER_NOT_FOUND);
  return n;
}

/** Own profile (FR-006, FR-007) and account management for the system administrator (FR-004, FR-009). */
function userRoutes(services) {
  const router = express.Router();
  const um = services.accounts;

  router.get('/profile', (req, res) => {
    res.json({ profile: um.getProfile(req.session) });
  });

  router.put('/profile', (req, res) => {
    res.json({ profile: um.updateProfile(req.session, req.body || {}) });
  });

  router.get('/users', (req, res) => {
    res.json(um.listUsers(req.session));
  });

  router.post('/users', (req, res) => {
    res.status(201).json({ user: um.createUser(req.session, req.body || {}) });
  });

  router.put('/users/:id/role', (req, res) => {
    res.json({ user: um.changeRole(req.session, userId(req.params.id), req.body || {}) });
  });

  router.put('/users/:id/status', (req, res) => {
    res.json({ user: um.setAccountStatus(req.session, userId(req.params.id), (req.body || {}).accountStatus) });
  });

  return router;
}

module.exports = { userRoutes };
