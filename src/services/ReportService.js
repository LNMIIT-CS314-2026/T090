'use strict';
const { AppError, MESSAGES } = require('../domain/errors');
const { toCsv } = require('../domain/csv');
const { parseYearRange } = require('./DashboardService');

const TYPE_LABELS = { JOURNAL: 'Journal article', CONFERENCE: 'Conference paper', BOOK_CHAPTER: 'Book chapter', BOOK: 'Book', PATENT: 'Patent', OTHER: 'Other' };
const TYPE_ORDER = Object.keys(TYPE_LABELS);
const REPORT_TITLES = { ACCREDITATION: 'Accreditation and ranking report', DEPARTMENT: 'Department research summary' };
const FULL_ACCESS = ['RESEARCH_ADMIN', 'INSTITUTE_MGMT'];

/**
 * Reporting (UC-013, UC-014): accreditation report (FR-034), department report (FR-035) and export
 * (FR-036). Built from VERIFIED publications only (BR-002). A report is stored as a snapshot, so it
 * reads the same when opened or exported later. Accreditation reports: research administrators and
 * institute management only (BR-007); a Head of Department gets department reports of their own
 * department (BR-006).
 */
class ReportService {
  constructor({ uow, reportRepo, dashboards, auth, audit, userRepo }) {
    Object.assign(this, { uow, reportRepo, dashboards, auth, audit, userRepo });
  }

  generate(session, { type, departmentId, yearFrom, yearTo } = {}) {
    if (!REPORT_TITLES[type]) throw invalid({ type: 'Select a report type.' });
    const user = type === 'ACCREDITATION'
      ? this.auth.authorize(session, FULL_ACCESS, MESSAGES.NO_REPORT_PERMISSION)
      : this.auth.authorize(session, [...FULL_ACCESS, 'HOD']);
    const range = parseYearRange({ yearFrom, yearTo }, { required: true });

    let dept = null;
    if (user.role === 'HOD') {
      if (departmentId && Number(departmentId) !== user.departmentId) throw new AppError('ACCESS_DENIED', MESSAGES.NO_DEPARTMENT_ACCESS);
      dept = this.userRepo.findDepartment(user.departmentId);
    } else if (departmentId) {
      dept = this.userRepo.findDepartment(Number(departmentId));
      if (!dept) throw invalid({ departmentId: MESSAGES.DEPARTMENT_NOT_FOUND });
    }
    if (type === 'DEPARTMENT' && !dept) throw invalid({ departmentId: 'Select a department.' });

    const content = type === 'ACCREDITATION' ? this.accreditation(range, dept) : this.department(range, dept);
    return this.uow.run(() => {
      const publicId = this.reportRepo.nextPublicId();
      const id = this.reportRepo.insert({
        publicId,
        type,
        generatedBy: user.id,
        departmentId: dept ? dept.id : null,
        yearFrom: range.yearFrom,
        yearTo: range.yearTo,
        generatedAt: new Date().toISOString(),
        content,
      });
      this.audit.record('GENERATE_REPORT', user.id, publicId, `${type} ${dept ? dept.code : 'institute'} ${range.yearFrom}–${range.yearTo}`);
      return this.reportRepo.findById(id);
    });
  }

  /** Reports the user may open: all for administrators and management, own department for a HoD. */
  list(session) {
    const user = this.auth.authorize(session, [...FULL_ACCESS, 'HOD']);
    return this.reportRepo.list(user.role === 'HOD' ? { departmentId: user.departmentId } : {})
      .filter((r) => user.role !== 'HOD' || r.type === 'DEPARTMENT');
  }

  get(session, id) {
    const user = this.auth.authorize(session, [...FULL_ACCESS, 'HOD']);
    const r = this.reportRepo.findById(id);
    if (!r) throw new AppError('NOT_FOUND', MESSAGES.REPORT_NOT_FOUND);
    if (user.role === 'HOD' && (r.type !== 'DEPARTMENT' || r.departmentId !== user.departmentId)) {
      throw new AppError('ACCESS_DENIED', r.type === 'ACCREDITATION' ? MESSAGES.NO_REPORT_PERMISSION : MESSAGES.NO_DEPARTMENT_ACCESS);
    }
    return r;
  }

  /** FR-036: the stored report as CSV (UTF-8 with byte-order mark, so spreadsheet programs read ≥ and –). */
  exportCsv(session, id) {
    const r = this.get(session, id);
    const c = r.content;
    const rows = [
      ['ResearchPulse', c.title],
      ['Report ID', r.publicId],
      ['Scope', c.scope],
      ['Publication years', `${r.yearFrom}–${r.yearTo}`],
      ['Generated', r.generatedAt, r.generatedByName],
      ['Basis', c.basis],
      [],
      [c.groupLabel, 'Researchers', 'Verified publications', ...TYPE_ORDER.map((t) => TYPE_LABELS[t]), 'Citations', 'h-index', 'i10-index'],
      ...c.groups.map((g) => [g.label, g.researcherCount ?? '', g.publications, ...TYPE_ORDER.map((t) => g.byType[t] || 0), g.citations, g.hIndex, g.i10Index]),
      ['Total', c.totals.researcherCount, c.totals.publications, ...TYPE_ORDER.map((t) => c.totals.byType[t] || 0), c.totals.citations, c.totals.hIndex, c.totals.i10Index],
      [],
      ['ID', 'Title', 'Authors', 'Type', 'Venue', 'Year', 'DOI / link', 'Citations', 'Researcher', 'Department'],
      ...c.publications.map((p) => [p.publicId, p.title, p.authors, TYPE_LABELS[p.publicationType], p.venue || '', p.year, p.doiLink || '', p.citations, p.ownerName, p.departmentCode]),
    ];
    const filename = `${r.publicId}-${r.type.toLowerCase()}${r.departmentCode ? '-' + r.departmentCode.toLowerCase() : ''}.csv`;
    return { filename, csv: '﻿' + toCsv(rows) };
  }

  /** FR-034: one row per department (or the chosen department), with output by publication type. */
  accreditation(range, dept) {
    const data = this.dashboards.instituteData(range, dept ? dept.id : null);
    return {
      title: REPORT_TITLES.ACCREDITATION,
      scope: dept ? `${dept.name} (${dept.code})` : 'Whole institute',
      basis: 'Verified publications only (BR-002); h-index and i10-index computed over the publications in the year range.',
      groupLabel: 'Department',
      groups: data.departments.map((d) => ({ label: `${d.name} (${d.code})`, researcherCount: d.researcherCount, ...pick(d) })),
      totals: { researcherCount: data.totals.researcherCount, ...pick(data.totals) },
      trend: data.trend,
      publications: this.dashboards.publications.findVerified({ departmentId: dept ? dept.id : null, ...range }).map(row),
    };
  }

  /** FR-035: one row per researcher of the department. */
  department(range, dept) {
    const data = this.dashboards.departmentData(dept, range);
    return {
      title: REPORT_TITLES.DEPARTMENT,
      scope: `${dept.name} (${dept.code})${data.department.headName ? `, Head of Department ${data.department.headName}` : ''}`,
      basis: 'Verified publications only (BR-002); only researchers of this department (BR-006).',
      groupLabel: 'Researcher',
      groups: data.researchers.map((r) => ({
        label: `${r.name}${r.designation ? `, ${r.designation}` : ''}${r.accountStatus === 'DEACTIVATED' ? ' (deactivated)' : ''}`,
        researcherCount: null,
        ...pick(r),
      })),
      totals: { researcherCount: data.totals.researcherCount, ...pick(data.totals) },
      trend: data.trend,
      publications: this.dashboards.publications.findVerified({ departmentId: dept.id, ...range }).map(row),
    };
  }
}

function pick(s) {
  return { publications: s.publications, citations: s.citations, hIndex: s.hIndex, i10Index: s.i10Index, byType: s.byType };
}

function row(p) {
  return {
    publicId: p.publicId, title: p.title, authors: p.authors, publicationType: p.publicationType, venue: p.venue,
    year: p.year, doiLink: p.doiLink, citations: p.citationCount, ownerName: p.ownerName, departmentCode: p.departmentCode,
  };
}

function invalid(errors) {
  return new AppError('VALIDATION_FAILED', MESSAGES.validationSummary(Object.keys(errors).length), { fieldErrors: errors });
}

module.exports = { ReportService, TYPE_LABELS };
