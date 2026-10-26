'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { buildServices } = require('./services');
const { AppError } = require('./domain/errors');
const { authRoutes, HOME } = require('./api/authRoutes');
const { publicationRoutes } = require('./api/publicationRoutes');
const { verificationRoutes } = require('./api/verificationRoutes');
const { dashboardRoutes } = require('./api/dashboardRoutes');
const { notificationRoutes } = require('./api/notificationRoutes');
const { makeRequireSession, COOKIE_NAME } = require('./api/requireSession');
const { errorHandler } = require('./api/errorHandler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Clean page URLs → HTML files in public/ (L1 presentation).
const PAGES = {
  '/login': 'login.html',
  '/researcher/dashboard': 'researcher/dashboard.html',
  '/researcher/publications': 'researcher/publications.html',
  '/researcher/publications/new': 'researcher/publication-form.html',
  '/researcher/publications/:id/edit': 'researcher/publication-form.html',
  '/researcher/publications/:id/outcome': 'researcher/outcome.html',
  '/researcher/metrics': 'researcher/metrics.html',
  '/researcher/notifications': 'researcher/notifications.html',
  '/admin/queue': 'admin/queue.html',
  '/admin/publications/:id': 'admin/review.html',
  '/admin/notifications': 'admin/notifications.html',
  '/hod/home': 'hod/home.html',
};

/** createApp(db) → express app. Used by server.js and by the API tests. */
function createApp(db, opts = {}) {
  const services = buildServices(db, opts);
  const app = express();
  app.disable('x-powered-by');
  app.locals.services = services;

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // --- L2 request handling ---
  app.use('/api/auth', authRoutes(services));
  app.use('/api', makeRequireSession(services.auth));
  app.use('/api', publicationRoutes(services));
  app.use('/api', verificationRoutes(services));
  app.use('/api', dashboardRoutes(services));
  app.use('/api', notificationRoutes(services));
  app.use('/api', (req, res, next) => next(new AppError('NOT_FOUND', 'Not found.')));

  // --- L1 pages ---
  app.get('/', (req, res) => {
    try {
      const s = services.auth.authenticate(req.cookies[COOKIE_NAME]);
      return res.redirect(HOME[s.role] || '/login');
    } catch {
      return res.redirect('/login');
    }
  });
  for (const [route, file] of Object.entries(PAGES)) {
    app.get(route, (req, res) => res.sendFile(path.join(PUBLIC_DIR, file)));
  }
  // The validation rules are shared with the browser (same file, no copy).
  app.get('/js/validation.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'domain', 'validation.js')));
  app.get('/favicon.ico', (req, res) => res.status(204).end()); // no logo image by design
  app.use(express.static(PUBLIC_DIR, { index: false }));
  app.use((req, res) => res.status(404).type('text/plain').send('Page not found.'));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
