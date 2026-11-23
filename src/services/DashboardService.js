'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { trendByYear, summarize } = require('../domain/metrics');

const DEPT_VIEWERS = ['HOD', 'RESEARCH_ADMIN', 'INSTITUTE_MGMT'];
const INSTITUTE_VIEWERS = ['RESEARCH_ADMIN', 'INSTITUTE_MGMT'];
const MAX_TREND_YEARS = 30;

/** Optional publication-year range from a query (FR-033). Both ends are optional; throws on bad input. */
function parseYearRange(q = {}, { required = false } = {}) {
  const current = new Date().getFullYear();
  const read = (v) => {
    const t = v === undefined || v === null ? '' : String(v).trim();
    if (t === '') return null;
    if (!/^\d{4}$/.test(t) || Number(t) < 1900 || Number(t) > current) throw new AppError('VALIDATION_FAILED', MESSAGES.YEAR_RANGE(current));
    return Number(t);
  };
  const yearFrom = read(q.yearFrom);
  const yearTo = read(q.yearTo);
  if ((required && (!yearFrom || !yearTo)) || (yearFrom && yearTo && yearFrom > yearTo)) {
    throw new AppError('VALIDATION_FAILED', MESSAGES.YEAR_RANGE(current));
  }
  return { yearFrom, yearTo };
}

/** {year: count} over the chosen range (or earliest year to the current year), gaps filled with 0. */
function trendInRange(pubs, { yearFrom, yearTo }) {
  const current = new Date().getFullYear();
  const end = yearTo || current;
  const start = Math.max(yearFrom || Math.min(end, ...pubs.map((p) => p.year)), end - MAX_TREND_YEARS + 1);
  const trend = {};
  for (let y = start; y <= end; y++) trend[y] = 0;
  for (const p of pubs) if (p.year in trend) trend[p.year] += 1;
  return trend;
}

function idList(v) {
  const parts = Array.isArray(v) ? v : String(v || '').split(',');
  return parts.map((x) => Number(String(x).trim())).filter((n) => Number.isInteger(n) && n > 0);
}

/** C8 Dashboard & Analytics (IDashboardService). Aggregates only verified publications (BR-002). */
class DashboardService {
  constructor({ publications, metricRepo, users, auth, userRepo }) {
    Object.assign(this, { publications, metricRepo, users, auth, userRepo });
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
    this.auth.authorize(session, ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD', 'INSTITUTE_MGMT', 'SYSTEM_ADMIN']);
    return this.users.listDepartments();
  }

  /** The department a user may see: a Head of Department only their own (BR-006). */
  resolveDepartment(session, departmentId) {
    const user = this.auth.authorize(session, DEPT_VIEWERS);
    const mine = departmentId === 'mine' || departmentId === undefined || departmentId === null || departmentId === '';
    const id = mine ? user.departmentId : Number(departmentId);
    if (user.role === 'HOD' && id !== user.departmentId) throw new AppError('ACCESS_DENIED', MESSAGES.NO_DEPARTMENT_ACCESS);
    const dept = id ? this.userRepo.findDepartment(id) : null;
    if (!dept) throw new AppError('NOT_FOUND', MESSAGES.DEPARTMENT_NOT_FOUND);
    return { user, dept };
  }

  /** FR-029 department dashboard, filtered by publication years and researcher (FR-033). */
  getDepartmentView(session, departmentId, query = {}) {
    const { dept } = this.resolveDepartment(session, departmentId);
    const range = parseYearRange(query);
    const researcherId = Number(query.researcherId) || null;
    return this.departmentData(dept, range, researcherId);
  }

  departmentData(dept, range, researcherId = null) {
    const researchers = this.userRepo.findResearchers(dept.id);
    if (researcherId && !researchers.some((r) => r.id === researcherId)) {
      throw new AppError('NOT_FOUND', MESSAGES.RESEARCHER_NOT_FOUND);
    }
    const shown = researcherId ? researchers.filter((r) => r.id === researcherId) : researchers;
    const pubs = this.publications.findVerified({ departmentId: dept.id, ...range, ownerIds: researcherId ? [researcherId] : null });
    const head = dept.headUserId ? this.users.findUser(dept.headUserId) : null;
    return {
      department: { id: dept.id, name: dept.name, code: dept.code, headName: head ? head.name : null },
      range,
      researcherId,
      allResearchers: researchers.map((r) => ({ id: r.id, name: r.name })),
      totals: { ...summarize(pubs), researcherCount: shown.length },
      researchers: shown
        .map((r) => ({
          id: r.id,
          name: r.name,
          designation: r.designation,
          accountStatus: r.accountStatus,
          ...summarize(pubs.filter((p) => p.ownerId === r.id)),
        }))
        .sort((a, b) => b.citations - a.citations || a.name.localeCompare(b.name)),
      trend: trendInRange(pubs, range),
      publications: [...pubs].sort((a, b) => b.citationCount - a.citationCount).map(pubRow),
    };
  }

  /** FR-030 institute dashboard for management and research administrators, filtered by department (FR-033). */
  getInstituteView(session, query = {}) {
    this.auth.authorize(session, INSTITUTE_VIEWERS);
    const range = parseYearRange(query);
    const departmentId = Number(query.departmentId) || null;
    return this.instituteData(range, departmentId);
  }

  instituteData(range, departmentId = null) {
    const departments = this.userRepo.listDepartments();
    if (departmentId && !departments.some((d) => d.id === departmentId)) throw new AppError('NOT_FOUND', MESSAGES.DEPARTMENT_NOT_FOUND);
    const shown = departmentId ? departments.filter((d) => d.id === departmentId) : departments;
    const pubs = this.publications.findVerified({ departmentId, ...range });
    const researchers = this.userRepo.findResearchers(departmentId);
    return {
      range,
      departmentId,
      allDepartments: departments.map((d) => ({ id: d.id, name: d.name, code: d.code })),
      totals: { ...summarize(pubs), researcherCount: researchers.length, departmentCount: shown.length },
      departments: shown.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        researcherCount: researchers.filter((r) => r.departmentId === d.id).length,
        ...summarize(pubs.filter((p) => p.departmentCode === d.code)),
      })),
      trend: trendInRange(pubs, range),
      topPublications: [...pubs].sort((a, b) => b.citationCount - a.citationCount).slice(0, 10).map(pubRow),
    };
  }

  /**
   * FR-031 comparison view: researchers or departments side by side over a year range, with a
   * per-year breakdown. A Head of Department compares researchers of their own department only.
   */
  getComparison(session, query = {}) {
    const user = this.auth.authorize(session, DEPT_VIEWERS);
    const mode = query.mode === 'departments' ? 'departments' : 'researchers';
    if (mode === 'departments' && user.role === 'HOD') throw new AppError('ACCESS_DENIED', MESSAGES.NO_DEPARTMENT_ACCESS);
    const range = parseYearRange(query);
    const ids = idList(query.ids);

    const candidates = mode === 'departments'
      ? this.userRepo.listDepartments().map((d) => ({ id: d.id, label: d.name, group: d.code }))
      : this.userRepo.findResearchers(user.role === 'HOD' ? user.departmentId : null)
        .map((r) => ({ id: r.id, label: r.name, group: r.departmentCode }));
    if (ids.some((id) => !candidates.some((c) => c.id === id))) {
      throw new AppError('ACCESS_DENIED', user.role === 'HOD' ? MESSAGES.NO_DEPARTMENT_ACCESS : MESSAGES.NO_PERMISSION);
    }

    const pubs = this.publications.findVerified({ departmentId: user.role === 'HOD' ? user.departmentId : null, ...range });
    const picked = ids.map((id) => {
      const c = candidates.find((x) => x.id === id);
      const mine = pubs.filter((p) => (mode === 'departments' ? p.departmentCode === c.group : p.ownerId === id));
      return { c, mine };
    });
    const years = Object.keys(trendInRange(picked.flatMap((x) => x.mine), range)).map(Number);
    const rows = picked.map(({ c, mine }) => ({
      id: c.id,
      label: c.label,
      group: c.group,
      ...summarize(mine),
      trend: Object.fromEntries(years.map((y) => [y, mine.filter((p) => p.year === y).length])),
    }));
    return { mode, range, candidates, rows, years };
  }
}

function pubRow(p) {
  return {
    id: p.id,
    publicId: p.publicId,
    title: p.title,
    authors: p.authors,
    publicationType: p.publicationType,
    venue: p.venue,
    year: p.year,
    doiLink: p.doiLink,
    citations: p.citationCount,
    ownerName: p.ownerName,
    departmentCode: p.departmentCode,
  };
}

module.exports = { DashboardService, parseYearRange, pubRow };
