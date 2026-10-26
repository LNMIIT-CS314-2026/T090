'use strict';

/** C10 Audit Logging (IAuditLog). Insert-only: there is no update or delete method (BR-010). */
class AuditService {
  constructor({ auditRepo }) {
    this.auditRepo = auditRepo;
  }

  record(action, actorId, targetId, details) {
    return this.auditRepo.insert({ action, actorId, targetId, details, at: new Date().toISOString() });
  }

  findByTarget(targetId) {
    return this.auditRepo.findByTarget(targetId);
  }
}

module.exports = { AuditService };
