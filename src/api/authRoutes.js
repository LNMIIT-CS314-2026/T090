'use strict';
const express = require('express');
const { makeRequireSession, COOKIE_NAME } = require('./requireSession');

const HOME = {
  RESEARCHER: '/researcher/dashboard',
  RESEARCH_ADMIN: '/admin/queue',
  HOD: '/hod/home',
};

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    department: u.departmentCode,
    departmentName: u.departmentName,
    designation: u.designation,
  };
}

function authRoutes(services) {
  const router = express.Router();
  const requireSession = makeRequireSession(services.auth);

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    const { token, user } = services.auth.login(email, password);
    res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.json({ user: publicUser(user), home: HOME[user.role] });
  });

  router.post('/logout', (req, res) => {
    services.auth.logout(req.cookies[COOKIE_NAME]);
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireSession, (req, res) => {
    const user = services.auth.authorize(req.session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD']);
    res.json({ user: publicUser(user), home: HOME[user.role], unreadCount: services.notifier.unreadCount(req.session) });
  });

  return router;
}

module.exports = { authRoutes, HOME };
