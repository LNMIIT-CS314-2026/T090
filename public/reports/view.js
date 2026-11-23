// One generated report (FR-034, FR-035) with export (FR-036): CSV download, and a print layout so the
// browser's "Print → Save as PDF" gives a PDF.
import { api } from '/js/api.js';
import { escapeHtml, fmtDateTime, TYPE_LABELS, TYPE_SHORT, idFromPath } from '/js/format.js';
import { initPage, setHeader, renderApiFailure } from '/js/layout.js';
import { trendChart } from '/js/charts.js';

const TYPES = Object.keys(TYPE_LABELS);

const page = await initPage({
  active: 'reports',
  title: 'Report',
  breadcrumb: [['Reports', '/reports'], ['Report', null]],
  roles: ['RESEARCH_ADMIN', 'INSTITUTE_MGMT', 'HOD'],
});

if (page) {
  const { content } = page;
  const id = idFromPath(/^\/reports\/(\d+)/);
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const { report } = await api('GET', `/api/reports/${id}`);
      render(report);
    } catch (err) {
      renderApiFailure(err, content, 'The report could not be loaded.', load);
    }
  }

  function render(r) {
    const c = r.content;
    document.title = `${r.publicId} ${c.title} · ResearchPulse`;
    setHeader({ title: `${escapeHtml(r.publicId)} — ${escapeHtml(c.title)}`, breadcrumb: [['Reports', '/reports'], [r.publicId, null]] });
    const usedTypes = TYPES.filter((t) => c.totals.byType[t]);
    content.innerHTML = `
      <div class="btn-row no-print" style="margin-bottom:14px">
        <button type="button" class="btn btn-primary" id="print">Print / save as PDF</button>
        <a class="btn" href="/api/reports/${r.id}/export.csv">Download CSV</a>
        <a class="btn" href="/reports">Back to reports</a>
      </div>
      <div class="report-letterhead">
        <img src="/img/lnmiit-logo.jpg" alt="LNMIIT" width="150" height="70">
        <div><div class="report-letterhead-title">${escapeHtml(c.title)}</div>
          <div class="muted">ResearchPulse · ${escapeHtml(r.publicId)}</div></div>
      </div>
      <dl class="report-meta">
        <dt>Institute</dt><dd>The LNM Institute of Information Technology, Jaipur</dd>
        <dt>Scope</dt><dd>${escapeHtml(c.scope)}</dd>
        <dt>Publication years</dt><dd>${r.yearFrom}–${r.yearTo}</dd>
        <dt>Generated</dt><dd>${escapeHtml(fmtDateTime(r.generatedAt))} by ${escapeHtml(r.generatedByName)}</dd>
        <dt>Basis</dt><dd>${escapeHtml(c.basis)}</dd>
      </dl>

      <h2>Summary</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>${escapeHtml(c.groupLabel)}</th>${r.type === 'ACCREDITATION' ? '<th class="num">Researchers</th>' : ''}
          <th class="num">Verified</th>${usedTypes.map((t) => `<th class="num">${escapeHtml(TYPE_SHORT[t])}</th>`).join('')}
          <th class="num">Citations</th><th class="num">h-index</th><th class="num">i10-index</th></tr></thead>
        <tbody>
          ${c.groups.map((g) => row(g, g.label, r.type === 'ACCREDITATION' ? g.researcherCount : null, usedTypes)).join('')}
          ${row(c.totals, 'Total', r.type === 'ACCREDITATION' ? c.totals.researcherCount : null, usedTypes, true)}
        </tbody></table></div>
      <p class="note">The total h-index and i10-index are computed over all listed publications together.</p>

      <h2>Verified publications per year</h2>
      <div class="box" style="max-width:520px">${trendChart(c.trend)}</div>

      <h2>Verified publications (${c.publications.length})</h2>
      ${c.publications.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Title</th><th>Authors</th><th>Type</th><th>Venue</th><th class="num">Year</th><th>DOI / link</th><th class="num">Cit.</th><th>Researcher</th></tr></thead>
        <tbody>${c.publications.map((p) => `<tr><td class="nowrap">${escapeHtml(p.publicId)}</td><td>${escapeHtml(p.title)}</td>
          <td>${escapeHtml(p.authors)}</td><td>${escapeHtml(TYPE_SHORT[p.publicationType])}</td><td>${escapeHtml(p.venue || '')}</td>
          <td class="num">${p.year}</td><td>${escapeHtml(p.doiLink || '—')}</td><td class="num">${p.citations}</td>
          <td>${escapeHtml(p.ownerName)} <span class="muted">(${escapeHtml(p.departmentCode || '')})</span></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="state">No verified publications in this scope and year range.</div>'}`;

    content.querySelector('#print').addEventListener('click', () => window.print());
  }

  function row(g, label, researchers, types, total = false) {
    return `<tr${total ? ' class="total"' : ''}><td>${escapeHtml(label)}</td>${researchers !== null ? `<td class="num">${researchers}</td>` : ''}
      <td class="num">${g.publications}</td>${types.map((t) => `<td class="num">${g.byType[t] || 0}</td>`).join('')}
      <td class="num">${g.citations}</td><td class="num">${g.hIndex}</td><td class="num">${g.i10Index}</td></tr>`;
  }
}
