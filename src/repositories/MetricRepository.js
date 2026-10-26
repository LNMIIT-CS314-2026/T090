'use strict';

function toMetric(row) {
  if (!row) return null;
  return {
    researcherId: row.researcher_id,
    totalCitations: row.total_citations,
    hIndex: row.h_index,
    i10Index: row.i10_index,
    verifiedCount: row.verified_count,
    computedAt: row.computed_at,
    triggeredBy: row.triggered_by,
  };
}

class MetricRepository {
  constructor(db) {
    this.db = db;
  }

  findByResearcher(researcherId) {
    return toMetric(this.db.prepare('SELECT * FROM impact_metrics WHERE researcher_id = ?').get(researcherId));
  }

  upsert(m) {
    this.db
      .prepare(
        `INSERT INTO impact_metrics (researcher_id, total_citations, h_index, i10_index, verified_count, computed_at, triggered_by)
         VALUES (@researcherId, @totalCitations, @hIndex, @i10Index, @verifiedCount, @computedAt, @triggeredBy)
         ON CONFLICT(researcher_id) DO UPDATE SET
           total_citations = excluded.total_citations, h_index = excluded.h_index, i10_index = excluded.i10_index,
           verified_count = excluded.verified_count, computed_at = excluded.computed_at, triggered_by = excluded.triggered_by`
      )
      .run(m);
  }
}

module.exports = { MetricRepository };
