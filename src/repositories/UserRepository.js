'use strict';

const USER_SELECT = `
  SELECT u.*, d.name AS department_name, d.code AS department_code
  FROM users u LEFT JOIN departments d ON d.department_id = u.department_id`;

function toUser(row) {
  if (!row) return null;
  return {
    id: row.user_id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    accountStatus: row.account_status,
    departmentId: row.department_id,
    departmentName: row.department_name || null,
    departmentCode: row.department_code || null,
    designation: row.designation,
    researchAreas: row.research_areas || null,
    phone: row.phone || null,
  };
}

function toDepartment(row) {
  if (!row) return null;
  return { id: row.department_id, name: row.name, code: row.code, headUserId: row.head_user_id };
}

class UserRepository {
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return toUser(this.db.prepare(`${USER_SELECT} WHERE u.user_id = ?`).get(id));
  }

  findByEmail(email) {
    return toUser(this.db.prepare(`${USER_SELECT} WHERE lower(u.email) = lower(?)`).get(email));
  }

  findActiveByRole(role) {
    return this.db
      .prepare(`${USER_SELECT} WHERE u.role = ? AND u.account_status = 'ACTIVE' ORDER BY u.user_id`)
      .all(role)
      .map(toUser);
  }

  findByDepartmentAndRole(departmentId, role) {
    return this.db
      .prepare(`${USER_SELECT} WHERE u.department_id = ? AND u.role = ? ORDER BY u.name`)
      .all(departmentId, role)
      .map(toUser);
  }

  /** All accounts for the system administrator (FR-004, FR-009), with their number of publications. */
  listAll() {
    return this.db
      .prepare(`SELECT u.*, d.name AS department_name, d.code AS department_code,
                       (SELECT COUNT(*) FROM publications p WHERE p.owner_id = u.user_id) AS publication_count
                FROM users u LEFT JOIN departments d ON d.department_id = u.department_id
                ORDER BY u.role, u.name`)
      .all()
      .map((r) => ({ ...toUser(r), publicationCount: r.publication_count }));
  }

  countPublications(ownerId) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM publications WHERE owner_id = ?').get(ownerId).n;
  }

  /** Researchers of one department or of all departments, with their department (dashboards, reports). */
  findResearchers(departmentId = null) {
    return this.db
      .prepare(`${USER_SELECT} WHERE u.role = 'RESEARCHER' AND (@d IS NULL OR u.department_id = @d) ORDER BY d.code, u.name`)
      .all({ d: departmentId })
      .map(toUser);
  }

  updateProfile(id, { name, designation, researchAreas, phone }) {
    this.db
      .prepare('UPDATE users SET name = ?, designation = ?, research_areas = ?, phone = ? WHERE user_id = ?')
      .run(name, designation, researchAreas, phone, id);
  }

  updateRole(id, role, departmentId) {
    this.db.prepare('UPDATE users SET role = ?, department_id = ? WHERE user_id = ?').run(role, departmentId ?? null, id);
  }

  setAccountStatus(id, status) {
    this.db.prepare('UPDATE users SET account_status = ? WHERE user_id = ?').run(status, id);
  }

  clearDepartmentHead(userId) {
    this.db.prepare('UPDATE departments SET head_user_id = NULL WHERE head_user_id = ?').run(userId);
  }

  listDepartments() {
    return this.db.prepare('SELECT * FROM departments ORDER BY name').all().map(toDepartment);
  }

  findDepartment(id) {
    return toDepartment(this.db.prepare('SELECT * FROM departments WHERE department_id = ?').get(id));
  }

  // --- used by the seed script and by account management ---
  insertDepartment({ name, code }) {
    return Number(this.db.prepare('INSERT INTO departments (name, code) VALUES (?, ?)').run(name, code).lastInsertRowid);
  }

  setDepartmentHead(departmentId, userId) {
    this.db.prepare('UPDATE departments SET head_user_id = ? WHERE department_id = ?').run(userId, departmentId);
  }

  insertUser(u) {
    return Number(
      this.db
        .prepare(
          `INSERT INTO users (name, email, password_hash, role, account_status, department_id, designation, research_areas, phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(u.name, u.email, u.passwordHash, u.role, u.accountStatus || 'ACTIVE', u.departmentId ?? null,
          u.designation ?? null, u.researchAreas ?? null, u.phone ?? null)
        .lastInsertRowid
    );
  }
}

module.exports = { UserRepository };
