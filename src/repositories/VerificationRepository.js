'use strict';

class VerificationRepository {
  constructor(db) {
    this.db = db;
  }

  insert({ publicationId, administratorId, decision, comments, decisionDate }) {
    return Number(
      this.db
        .prepare(
          `INSERT INTO verifications (publication_id, administrator_id, decision, comments, decision_date)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(publicationId, administratorId, decision, comments ?? null, decisionDate).lastInsertRowid
    );
  }

  /** Review history of one publication, oldest decision first, with the administrator's name. */
  findByPublication(publicationId) {
    return this.db
      .prepare(
        `SELECT v.*, u.name AS administrator_name FROM verifications v
         JOIN users u ON u.user_id = v.administrator_id
         WHERE v.publication_id = ? ORDER BY v.decision_date, v.verification_id`
      )
      .all(publicationId)
      .map((r) => ({
        id: r.verification_id,
        publicationId: r.publication_id,
        administratorId: r.administrator_id,
        administratorName: r.administrator_name,
        decision: r.decision,
        comments: r.comments,
        decisionDate: r.decision_date,
      }));
  }

  countByPublication(publicationId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM verifications WHERE publication_id = ?').get(publicationId).n;
  }
}

module.exports = { VerificationRepository };
