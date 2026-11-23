'use strict';
const fs = require('fs');
const path = require('path');
const { AppError, MESSAGES } = require('../domain/errors');

const MAX_ATTEMPTS = 3;

/** C9 Notification (INotificationService). E-mail is simulated by appending to data/mail.log. */
class NotificationService {
  constructor({ notificationRepo, users, auth, mailLogPath, quiet = false, baseUrl = 'http://localhost:3000' }) {
    this.repo = notificationRepo;
    this.users = users;
    this.auth = auth;
    this.mailLogPath = mailLogPath;
    this.quiet = quiet;
    this.baseUrl = baseUrl;
  }

  notifyResearcher(researcherId, type, message, publicationId) {
    return this.repo.insert({ recipientId: researcherId, type, message, publicationId, createdAt: new Date().toISOString() });
  }

  /** One notification per ACTIVE research administrator (FR-039). */
  notifyAdministrators(type, message, publicationId) {
    const at = new Date().toISOString();
    return this.users
      .getActiveAdministrators()
      .map((admin) => this.repo.insert({ recipientId: admin.id, type, message, publicationId, createdAt: at }));
  }

  getNotifications(session) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD']);
    return this.repo.findByRecipient(session.userId).map(strip);
  }

  markRead(session, id) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD']);
    const n = this.repo.findById(id);
    if (!n || n.recipientId !== session.userId) throw new AppError('NOT_FOUND', MESSAGES.NOTIFICATION_NOT_FOUND);
    this.repo.markRead(id);
  }

  markAllRead(session) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD']);
    this.repo.markAllRead(session.userId);
  }

  unreadCount(session) {
    return this.repo.unreadCount(session.userId);
  }

  /**
   * Sends every PENDING notification as a simulated e-mail. A failed write increments attempts; after
   * 3 attempts the notification becomes FAILED. Runs after commit, so it never rolls back a decision.
   */
  dispatchPending() {
    let sent = 0;
    for (const n of this.repo.findPending()) {
      const subject = `ResearchPulse: ${shortSubject(n)}`;
      try {
        if (!this.mailLogPath) throw new Error('No mail log configured');
        fs.mkdirSync(path.dirname(this.mailLogPath), { recursive: true });
        fs.appendFileSync(this.mailLogPath, this.formatMail(n, subject), 'utf8');
        this.repo.markSent(n.id);
        sent++;
        if (!this.quiet) console.log(`[MAIL] to=${n.recipientEmail} subject="${subject}"`);
      } catch (err) {
        this.repo.recordFailedAttempt(n.id, MAX_ATTEMPTS);
        if (!this.quiet) console.error(`[MAIL] failed to=${n.recipientEmail}: ${err.message}`);
      }
    }
    return sent;
  }

  formatMail(n, subject) {
    return [
      '----------------------------------------------------------------',
      `Date:    ${new Date().toISOString()}`,
      `From:    ResearchPulse <no-reply@lnmiit.ac.in>`,
      `To:      ${n.recipientName} <${n.recipientEmail}>`,
      `Subject: ${subject}`,
      '',
      `Dear ${n.recipientName},`,
      '',
      n.message,
      '',
      `Sign in at ${this.baseUrl} to view the record.`,
      '',
      '',
    ].join('\n');
  }
}

function shortSubject(n) {
  const id = n.publicId || 'A publication';
  if (n.type === 'NEW_RECORD_PENDING') return `${id} is waiting for verification`;
  if (n.type === 'PUBLICATION_VERIFIED') return `${id} was verified`;
  if (n.type === 'MILESTONE') return 'new research milestone';
  return `${id} was rejected`;
}

function strip(n) {
  const { recipientEmail, recipientName, ...rest } = n;
  return rest;
}

module.exports = { NotificationService, MAX_ATTEMPTS };
