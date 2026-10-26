'use strict';

/** Insert-only persistence of audit_logs (BR-010). There is deliberately no update or delete. */
class AuditRepository {
  constructor(db) {
    this.db = db;
  }

  insert({ action, actorId, targetId, details, at }) {
    return Number(
      this.db
        .prepare('INSERT INTO audit_logs (action, actor_id, target_id, details, at) VALUES (?, ?, ?, ?, ?)')
        .run(action, actorId, targetId, details ?? null, at).lastInsertRowid
    );
  }

  findByTarget(targetId) {
    return this.db
      .prepare('SELECT * FROM audit_logs WHERE target_id = ? ORDER BY at, log_id')
      .all(targetId)
      .map((r) => ({ id: r.log_id, action: r.action, actorId: r.actor_id, targetId: r.target_id, details: r.details, at: r.at }));
  }
}

module.exports = { AuditRepository };
