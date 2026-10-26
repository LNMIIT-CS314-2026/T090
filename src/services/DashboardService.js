'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { trendByYear } = require('../domain/metrics');

/** C8 Dashboard & Analytics (IDashboardService). */
class DashboardService {
  constructor({ publications, metricRepo, users, auth }) {
    Object.assign(this, { publications, metricRepo, users, auth });
  }

  /** W01 / W06. A researcher may only view themselves; administrators may view anyone (AC-14). */
  getIndividualView(session, researcherId) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN']);
    const id = researcherId === 'me' ? session.userId : Number(researcherId);
    if (session.role === 'RESEARCHER' && id !== session.userId) throw new AppError('ACCESS_DENIED', MESSAGES.NO_PERMISSION);

    const r = this.users.findUser(id);
    if (!r || r.role !== 'RESEARCHER') throw new AppError('NOT_FOUND', MESSAGES.RESEARCHER_NOT_FOUND);

    const m = this.metricRepo.findByResearcher(id) || {
      totalCitations: 0, hIndex: 0, i10Index: 0, verifiedCount: 0, computedAt: null, triggeredBy: null,
    };
    const verified = this.publications.findVerifiedByOwner(id); // sorted by citations, descending
    const rankedVerified = verified.map((p, i) => ({
      id: p.id,
      publicId: p.publicId,
      title: p.title,
      year: p.year,
      citations: p.citationCount,
      rank: i + 1,
      countsForH: p.citationCount >= i + 1 && i + 1 <= m.hIndex,
    }));

    return {
      researcher: { id: r.id, name: r.name, department: r.departmentName, departmentCode: r.departmentCode, designation: r.designation },
      metrics: {
        totalCitations: m.totalCitations,
        hIndex: m.hIndex,
        i10Index: m.i10Index,
        verifiedCount: m.verifiedCount,
        computedAt: m.computedAt,
        triggeredBy: m.triggeredBy,
      },
      trend: trendByYear(verified),
      rankedVerified,
    };
  }

  /** HoD home: read-only totals of the HoD's own department only (BR-006). */
  getDepartmentSummary(session) {
    const hod = this.auth.authorize(session, 'HOD');
    const dept = this.users.getDepartmentOf(hod.id);
    if (!dept) throw new AppError('NOT_FOUND', 'No department is assigned to this account.');
    const researchers = this.users.getResearchers(dept.id);
    const verified = this.publications.findVerifiedByDepartment(dept.id);
    return {
      department: { id: dept.id, name: dept.name, code: dept.code },
      researcherCount: researchers.length,
      verifiedCount: verified.length,
      totalCitations: verified.reduce((s, p) => s + p.citationCount, 0),
    };
  }

  listDepartments(session) {
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD']);
    return this.users.listDepartments();
  }
}

module.exports = { DashboardService };
