'use strict';

const REPORT_SELECT = `
  SELECT r.*, u.name AS generated_by_name, d.name AS department_name, d.code AS department_code
  FROM reports r
  JOIN users u ON u.user_id = r.generated_by
  LEFT JOIN departments d ON d.department_id = r.department_id`;

function toReport(row, withContent = true) {
  if (!row) return null;
  const r = {
    id: row.report_id,
    publicId: row.public_id,
    type: row.type,
    generatedBy: row.generated_by,
    generatedByName: row.generated_by_name,
    departmentId: row.department_id,
    departmentName: row.department_name || null,
    departmentCode: row.department_code || null,
    yearFrom: row.year_from,
    yearTo: row.year_to,
    status: row.status,
    generatedAt: row.generated_at,
  };
  if (withContent) r.content = JSON.parse(row.content);
  return r;
}

/** Persistence of generated reports (data requirement 'Report', SRS section 16). */
class ReportRepository {
  constructor(db) {
    this.db = db;
  }

  /** Next report ID ('R-0001', …) inside the caller's transaction. */
  nextPublicId() {
    this.db.prepare("INSERT INTO sequences (name, value) VALUES ('report_id', 0) ON CONFLICT(name) DO NOTHING").run();
    const row = this.db.prepare("UPDATE sequences SET value = value + 1 WHERE name = 'report_id' RETURNING value").get();
    return 'R-' + String(row.value).padStart(4, '0');
  }

  insert(r) {
    return Number(
      this.db
        .prepare(
          `INSERT INTO reports (public_id, type, generated_by, department_id, year_from, year_to, status, generated_at, content)
           VALUES (?, ?, ?, ?, ?, ?, 'GENERATED', ?, ?)`
        )
        .run(r.publicId, r.type, r.generatedBy, r.departmentId ?? null, r.yearFrom, r.yearTo, r.generatedAt, JSON.stringify(r.content))
        .lastInsertRowid
    );
  }

  findById(id) {
    return toReport(this.db.prepare(`${REPORT_SELECT} WHERE r.report_id = ?`).get(id));
  }

  /** Newest first, without the content. departmentId limits the list to one department's reports. */
  list({ departmentId = null } = {}) {
    return this.db
      .prepare(`${REPORT_SELECT} WHERE (@d IS NULL OR r.department_id = @d) ORDER BY r.generated_at DESC, r.report_id DESC`)
      .all({ d: departmentId })
      .map((row) => toReport(row, false));
  }
}

module.exports = { ReportRepository };
