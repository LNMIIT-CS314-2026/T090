'use strict';

const SELECT = `
  SELECT n.*, p.public_id, u.name AS recipient_name, u.email AS recipient_email
  FROM notifications n
  JOIN users u ON u.user_id = n.recipient_id
  LEFT JOIN publications p ON p.publication_id = n.publication_id`;

function toNotification(row) {
  if (!row) return null;
  return {
    id: row.notification_id,
    recipientId: row.recipient_id,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    type: row.type,
    message: row.message,
    publicationId: row.publication_id,
    publicId: row.public_id || null,
    readStatus: row.read_status,
    emailStatus: row.email_status,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

class NotificationRepository {
  constructor(db) {
    this.db = db;
  }

  insert({ recipientId, type, message, publicationId, createdAt, readStatus = 'UNREAD', emailStatus = 'PENDING' }) {
    return Number(
      this.db
        .prepare(
          `INSERT INTO notifications (recipient_id, type, message, publication_id, read_status, email_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(recipientId, type, message, publicationId ?? null, readStatus, emailStatus, createdAt).lastInsertRowid
    );
  }

  findById(id) {
    return toNotification(this.db.prepare(`${SELECT} WHERE n.notification_id = ?`).get(id));
  }

  findByRecipient(recipientId) {
    return this.db
      .prepare(`${SELECT} WHERE n.recipient_id = ? ORDER BY n.created_at DESC, n.notification_id DESC`)
      .all(recipientId)
      .map(toNotification);
  }

  findPending() {
    return this.db
      .prepare(`${SELECT} WHERE n.email_status = 'PENDING' ORDER BY n.notification_id`)
      .all()
      .map(toNotification);
  }

  markSent(id) {
    this.db.prepare("UPDATE notifications SET email_status = 'SENT', attempts = attempts + 1 WHERE notification_id = ?").run(id);
  }

  recordFailedAttempt(id, maxAttempts) {
    this.db
      .prepare(
        `UPDATE notifications SET attempts = attempts + 1,
           email_status = CASE WHEN attempts + 1 >= ? THEN 'FAILED' ELSE 'PENDING' END
         WHERE notification_id = ?`
      )
      .run(maxAttempts, id);
  }

  markRead(id) {
    this.db.prepare("UPDATE notifications SET read_status = 'READ' WHERE notification_id = ?").run(id);
  }

  markAllRead(recipientId) {
    this.db.prepare("UPDATE notifications SET read_status = 'READ' WHERE recipient_id = ? AND read_status = 'UNREAD'").run(recipientId);
  }

  unreadCount(recipientId) {
    return this.db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = ? AND read_status = 'UNREAD'")
      .get(recipientId).n;
  }

  countForPublication(publicationId, type) {
    return this.db
      .prepare('SELECT COUNT(*) AS n FROM notifications WHERE publication_id = ? AND type = ?')
      .get(publicationId, type).n;
  }
}

module.exports = { NotificationRepository };
