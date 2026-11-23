'use strict';
const { totalCitations, hIndex, i10Index } = require('../domain/metrics');

/** C7 Metric Computation (IMetricService), UC-008. Joins the caller's transaction. */
class MetricCalculator {
  constructor({ publications, metricRepo }) {
    this.publications = publications;
    this.metricRepo = metricRepo;
  }

  /**
   * Recomputes the researcher's metrics from VERIFIED publications only (BR-002, BR-004).
   * The result carries the values before the recomputation in `previous` (FR-038 milestones).
   */
  recompute(researcherId, triggerPublicId, at = new Date().toISOString()) {
    const before = this.metricRepo.findByResearcher(researcherId);
    const verified = this.publications.findVerifiedByOwner(researcherId);
    const citations = verified.map((p) => Math.max(0, p.citationCount));
    const metrics = {
      researcherId,
      totalCitations: totalCitations(citations),
      hIndex: hIndex(citations),
      i10Index: i10Index(citations),
      verifiedCount: verified.length,
      computedAt: at,
      triggeredBy: triggerPublicId ?? null,
    };
    this.metricRepo.upsert(metrics);
    const previous = before
      ? { totalCitations: before.totalCitations, hIndex: before.hIndex, i10Index: before.i10Index }
      : { totalCitations: 0, hIndex: 0, i10Index: 0 };
    return { ...metrics, previous };
  }
}

module.exports = { MetricCalculator };
