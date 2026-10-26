'use strict';
const path = require('path');
const { createUnitOfWork } = require('../repositories/unitOfWork');
const { UserRepository } = require('../repositories/UserRepository');
const { PublicationRepository } = require('../repositories/PublicationRepository');
const { VerificationRepository } = require('../repositories/VerificationRepository');
const { MetricRepository } = require('../repositories/MetricRepository');
const { NotificationRepository } = require('../repositories/NotificationRepository');
const { AuditRepository } = require('../repositories/AuditRepository');
const { AuthService } = require('./AuthService');
const { UserDirectoryService } = require('./UserDirectoryService');
const { DuplicateDetector } = require('./DuplicateDetector');
const { PublicationManager } = require('./PublicationManager');
const { VerificationManager } = require('./VerificationManager');
const { MetricCalculator } = require('./MetricCalculator');
const { DashboardService } = require('./DashboardService');
const { NotificationService } = require('./NotificationService');
const { AuditService } = require('./AuditService');

const DEFAULT_MAIL_LOG = path.join(__dirname, '..', '..', 'data', 'mail.log');

/** Wires repositories (L5) and services (L3) together. Each service only sees the collaborators it needs. */
function buildServices(db, opts = {}) {
  const uow = createUnitOfWork(db);
  const userRepo = new UserRepository(db);
  const publications = new PublicationRepository(db);
  const verifications = new VerificationRepository(db);
  const metricRepo = new MetricRepository(db);
  const notificationRepo = new NotificationRepository(db);
  const auditRepo = new AuditRepository(db);

  const users = new UserDirectoryService({ userRepo });
  const auth = new AuthService({ users });
  const audit = new AuditService({ auditRepo });
  const detector = new DuplicateDetector({ publications });
  const metrics = new MetricCalculator({ publications, metricRepo });
  const notifier = new NotificationService({
    notificationRepo,
    users,
    auth,
    mailLogPath: opts.mailLogPath === undefined ? DEFAULT_MAIL_LOG : opts.mailLogPath,
    quiet: !!opts.quiet,
  });
  const publicationManager = new PublicationManager({ uow, publications, verifications, detector, auth, users, notifier });
  const verificationManager = new VerificationManager({ uow, publications, verifications, detector, auth, audit, metrics, notifier });
  const dashboards = new DashboardService({ publications, metricRepo, users, auth });

  return {
    uow,
    repos: { userRepo, publications, verifications, metricRepo, notificationRepo, auditRepo },
    auth,
    users,
    audit,
    detector,
    metrics,
    notifier,
    publications: publicationManager,
    verification: verificationManager,
    dashboards,
  };
}

module.exports = { buildServices };
