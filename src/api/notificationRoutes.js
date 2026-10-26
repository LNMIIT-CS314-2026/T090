'use strict';
const express = require('express');
const { AppError, MESSAGES } = require('../domain/errors');

function notificationRoutes(services) {
  const router = express.Router();
  const ns = services.notifier;

  router.get('/notifications', (req, res) => {
    res.json({ notifications: ns.getNotifications(req.session), unreadCount: ns.unreadCount(req.session) });
  });

  router.post('/notifications/read-all', (req, res) => {
    ns.markAllRead(req.session);
    res.status(204).end();
  });

  router.post('/notifications/:id/read', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError('NOT_FOUND', MESSAGES.NOTIFICATION_NOT_FOUND);
    ns.markRead(req.session, id);
    res.status(204).end();
  });

  return router;
}

module.exports = { notificationRoutes };
