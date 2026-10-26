'use strict';
const { totalCitations, hIndex, i10Index } = require('../domain/metrics');

/** C7 Metric Computation (IMetricService), UC-008. Joins the caller's transaction. */
class MetricCalculator {
  constructor({ publications, metricRepo }) {
    this.publications = publications;
    this.metricRepo = metricRepo;
  }

  /** Recomputes the researcher's metrics from VERIFIED publications only (BR-002, BR-004). */
  recompute(researcherId, triggerPublicId, at = new Date().toISOString()) {
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
    return metrics;
  }
}

module.exports = { MetricCalculator };
