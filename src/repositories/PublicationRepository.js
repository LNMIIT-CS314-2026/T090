'use strict';

const PUB_SELECT = `
  SELECT p.*, u.name AS owner_name, d.code AS department_code, d.name AS department_name,
         r.name AS reviewer_name
  FROM publications p
  JOIN users u ON u.user_id = p.owner_id
  LEFT JOIN departments d ON d.department_id = u.department_id
  LEFT JOIN users r ON r.user_id = p.reviewer_id`;

function toPublication(row) {
  if (!row) return null;
  return {
    id: row.publication_id,
    publicId: row.public_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    departmentCode: row.department_code || null,
    departmentName: row.department_name || null,
    title: row.title,
    authors: row.authors,
    publicationType: row.publication_type,
    venue: row.venue,
    year: row.year,
    doiLink: row.doi_link,
    citationCount: row.citation_count,
    normalizedTitle: row.normalized_title,
    normalizedDoi: row.normalized_doi,
    status: row.status,
    duplicateFlag: row.duplicate_flag === 1,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    version: row.version,
  };
}

// Columns that updateFields() may change (camelCase → column).
const UPDATABLE = {
  title: 'title',
  authors: 'authors',
  publicationType: 'publication_type',
  venue: 'venue',
  year: 'year',
  doiLink: 'doi_link',
  citationCount: 'citation_count',
  normalizedTitle: 'normalized_title',
  normalizedDoi: 'normalized_doi',
  status: 'status',
  duplicateFlag: 'duplicate_flag',
  reviewerId: 'reviewer_id',
  submittedAt: 'submitted_at',
  updatedAt: 'updated_at',
};

class PublicationRepository {
  constructor(db) {
    this.db = db;
  }

  /** Next public ID ('P-1120', …). Runs inside the caller's transaction, so a rollback gives the number back. */
  nextPublicId() {
    const row = this.db.prepare("UPDATE sequences SET value = value + 1 WHERE name = 'public_id' RETURNING value").get();
    return 'P-' + String(row.value).padStart(4, '0');
  }

  initSequence(lastUsed) {
    this.db
      .prepare("INSERT INTO sequences (name, value) VALUES ('public_id', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value")
      .run(lastUsed);
  }

  insert(p) {
    const info = this.db
      .prepare(
        `INSERT INTO publications (public_id, owner_id, title, authors, publication_type, venue, year, doi_link,
           citation_count, normalized_title, normalized_doi, status, duplicate_flag, reviewer_id,
           created_at, updated_at, submitted_at, version)
         VALUES (@publicId, @ownerId, @title, @authors, @publicationType, @venue, @year, @doiLink,
           @citationCount, @normalizedTitle, @normalizedDoi, @status, @duplicateFlag, @reviewerId,
           @createdAt, @updatedAt, @submittedAt, @version)`
      )
      .run({
        reviewerId: null,
        submittedAt: null,
        version: 1,
        ...p,
        duplicateFlag: p.duplicateFlag ? 1 : 0,
      });
    return Number(info.lastInsertRowid);
  }

  findById(id) {
    return toPublication(this.db.prepare(`${PUB_SELECT} WHERE p.publication_id = ?`).get(id));
  }

  findByPublicId(publicId) {
    return toPublication(this.db.prepare(`${PUB_SELECT} WHERE p.public_id = ?`).get(publicId));
  }

  /**
   * Optimistic update: UPDATE … WHERE publication_id = ? AND version = ?. Increments the version.
   * Returns the number of changed rows (0 means someone else changed the record first).
   */
  updateFields(id, expectedVersion, fields) {
    const sets = [];
    const params = { id, expectedVersion };
    for (const [key, value] of Object.entries(fields)) {
      const column = UPDATABLE[key];
      if (!column) throw new Error(`Unknown publication field: ${key}`);
      sets.push(`${column} = @${key}`);
      params[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
    }
    sets.push('version = version + 1');
    const sql = `UPDATE publications SET ${sets.join(', ')} WHERE publication_id = @id AND version = @expectedVersion`;
    return this.db.prepare(sql).run(params).changes;
  }

  delete(id) {
    return this.db.prepare('DELETE FROM publications WHERE publication_id = ?').run(id).changes;
  }

  /** getMyPublications filter: text on title/authors, exact year, exact status; newest first. */
  findByOwner(ownerId, { text, year, status } = {}) {
    const where = ['p.owner_id = @ownerId'];
    const params = { ownerId };
    if (text) {
      where.push("(p.title LIKE @text ESCAPE '\\' OR p.authors LIKE @text ESCAPE '\\')");
      params.text = '%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    }
    if (year) {
      where.push('p.year = @year');
      params.year = year;
    }
    if (status) {
      where.push('p.status = @status');
      params.status = status;
    }
    return this.db
      .prepare(`${PUB_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC, p.publication_id DESC`)
      .all(params)
      .map(toPublication);
  }

  /** Same owner, any status: same normalized DOI (both non-null) or same normalized title and year. */
  findDuplicateCandidates(ownerId, normalizedTitle, year, normalizedDoi, excludeId = null, onlyStatus = null) {
    const sql = `${PUB_SELECT}
      WHERE p.owner_id = @ownerId
        AND (@excludeId IS NULL OR p.publication_id <> @excludeId)
        AND (@onlyStatus IS NULL OR p.status = @onlyStatus)
        AND ((@nd IS NOT NULL AND p.normalized_doi = @nd) OR (p.normalized_title = @nt AND p.year = @year))
      ORDER BY p.public_id`;
    return this.db
      .prepare(sql)
      .all({ ownerId, nt: normalizedTitle, year, nd: normalizedDoi, excludeId, onlyStatus })
      .map(toPublication);
  }

  findVerifiedByOwner(ownerId) {
    return this.db
      .prepare(`${PUB_SELECT} WHERE p.owner_id = ? AND p.status = 'VERIFIED'
                ORDER BY p.citation_count DESC, p.year DESC, p.public_id`)
      .all(ownerId)
      .map(toPublication);
  }

  /** Verification queue: by status, optional department / text / reviewer filters, oldest submission first. */
  findQueue({ status, departmentId, text, reviewerId }) {
    const where = ['p.status = @status'];
    const params = { status };
    if (departmentId) {
      where.push('u.department_id = @departmentId');
      params.departmentId = departmentId;
    }
    if (text) {
      where.push("(p.title LIKE @text ESCAPE '\\' OR u.name LIKE @text ESCAPE '\\' OR p.public_id LIKE @text ESCAPE '\\')");
      params.text = '%' + text.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
    }
    if (reviewerId) {
      where.push('p.reviewer_id = @reviewerId');
      params.reviewerId = reviewerId;
    }
    return this.db
      .prepare(`${PUB_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.submitted_at ASC, p.publication_id ASC`)
      .all(params)
      .map(toPublication);
  }

  /** Verified publications of all researchers of one department (BR-006). */
  findVerifiedByDepartment(departmentId) {
    return this.db
      .prepare(`${PUB_SELECT} WHERE u.department_id = ? AND p.status = 'VERIFIED' ORDER BY p.public_id`)
      .all(departmentId)
      .map(toPublication);
  }

  /**
   * Verified publications for dashboards and reports (FR-029 – FR-035), filtered by department,
   * owner and publication year range. Ordered by department, owner and year.
   */
  findVerified({ departmentId = null, ownerIds = null, yearFrom = null, yearTo = null } = {}) {
    const where = ["p.status = 'VERIFIED'"];
    const params = {};
    if (departmentId) { where.push('u.department_id = @departmentId'); params.departmentId = departmentId; }
    if (yearFrom) { where.push('p.year >= @yearFrom'); params.yearFrom = yearFrom; }
    if (yearTo) { where.push('p.year <= @yearTo'); params.yearTo = yearTo; }
    let rows = this.db
      .prepare(`${PUB_SELECT} WHERE ${where.join(' AND ')} ORDER BY d.code, u.name, p.year DESC, p.public_id`)
      .all(params)
      .map(toPublication);
    if (ownerIds) rows = rows.filter((p) => ownerIds.includes(p.ownerId));
    return rows;
  }

  insertHistory(publicationId, fromStatus, toStatus, actorId, at) {
    this.db
      .prepare('INSERT INTO status_history (publication_id, from_status, to_status, actor_id, at) VALUES (?, ?, ?, ?, ?)')
      .run(publicationId, fromStatus, toStatus, actorId, at);
  }

  findHistory(publicationId) {
    return this.db
      .prepare(
        `SELECT h.*, u.name AS actor_name FROM status_history h JOIN users u ON u.user_id = h.actor_id
         WHERE h.publication_id = ? ORDER BY h.at, h.id`
      )
      .all(publicationId)
      .map((r) => ({ fromStatus: r.from_status, toStatus: r.to_status, actorId: r.actor_id, actorName: r.actor_name, at: r.at }));
  }
}

module.exports = { PublicationRepository, toPublication };
