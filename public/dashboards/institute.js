// FR-030 Institute dashboard (UC-011) for institute management and research administrators,
// filtered by department and year range (FR-033).
import { api } from '/js/api.js';
import { escapeHtml, TYPE_SHORT } from '/js/format.js';
import { initPage, setHeader, showFlash, clearFlash, renderApiFailure } from '/js/layout.js';
import { trendChart, hbar } from '/js/charts.js';
import { yearRangeFields, readYearRange, rangeLabel, queryString } from '/js/filters.js';

const page = await initPage({ active: 'institute', title: 'Institute dashboard', roles: ['INSTITUTE_MGMT', 'RESEARCH_ADMIN'] });

if (page) {
  const { content } = page;
  const params = new URLSearchParams(window.location.search);
  const state = { departmentId: params.get('departmentId') || '', yearFrom: params.get('yearFrom') || null, yearTo: params.get('yearTo') || null };
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      render(await api('GET', `/api/dashboards/institute${queryString(state)}`));
    } catch (err) {
      renderApiFailure(err, content, 'The institute dashboard could not be loaded.', load);
    }
  }

  function render(v) {
    const t = v.totals;
    setHeader({ subtitle: `LNMIIT · verified publications only, ${rangeLabel(v.range)}` });
    const maxC = Math.max(0, ...v.departments.map((d) => d.citations));
    content.innerHTML = `
      <form class="filter-bar" id="filters">
        <label class="inline-field">Department
          <select name="departmentId"><option value="">All departments</option>
            ${v.allDepartments.map((d) => `<option value="${d.id}"${String(d.id) === String(v.departmentId || '') ? ' selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select></label>
        ${yearRangeFields(v.range)}
        <button type="submit" class="btn">Apply</button>
        <a class="btn" href="/dashboards/compare?mode=departments">Compare departments</a>
        <a class="btn" href="/reports">Reports</a>
      </form>

      <div class="metrics">
        <div class="metric"><div class="label">Departments</div><div class="value">${t.departmentCount}</div><div class="def">${t.researcherCount} researchers</div></div>
        <div class="metric"><div class="label">Verified publications</div><div class="value">${t.publications}</div><div class="def">${rangeLabel(v.range)}</div></div>
        <div class="metric"><div class="label">Total citations</div><div class="value">${t.citations}</div><div class="def">of these publications</div></div>
        <div class="metric"><div class="label">Institute h-index</div><div class="value">${t.hIndex}</div><div class="def">i10-index ${t.i10Index}</div></div>
      </div>

      <div class="two-col">
        <div>
          <h2>Departments</h2>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Department</th><th class="num">Researchers</th><th class="num">Verified</th><th class="num">Citations</th><th class="num">h-index</th><th class="num">i10</th></tr></thead>
            <tbody>${v.departments.map((d) => `<tr>
                <td><a href="/dashboards/department${queryString({ dept: d.id, yearFrom: v.range.yearFrom, yearTo: v.range.yearTo })}">${escapeHtml(d.name)}</a></td>
                <td class="num">${d.researcherCount}</td><td class="num">${d.publications}</td>
                <td class="num nowrap">${d.citations}${hbar(d.citations, maxC)}</td>
                <td class="num">${d.hIndex}</td><td class="num">${d.i10Index}</td></tr>`).join('')}
              <tr class="total"><td>Total</td><td class="num">${t.researcherCount}</td><td class="num">${t.publications}</td><td class="num">${t.citations}</td><td class="num">${t.hIndex}</td><td class="num">${t.i10Index}</td></tr>
            </tbody></table></div>
          <p class="note">By type: ${Object.entries(t.byType).map(([k, n]) => `${escapeHtml(TYPE_SHORT[k])} ${n}`).join(' · ') || '—'}.
            The total h-index is computed over all publications together, not added up.</p>
        </div>
        <div>
          <h2>Publication trend</h2>
          <div class="box">${trendChart(v.trend)}</div>
        </div>
      </div>

      <h2>Most cited verified publications</h2>
      ${v.topPublications.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Title</th><th>Researcher</th><th>Dept</th><th class="num">Year</th><th class="num">Cit.</th></tr></thead>
        <tbody>${v.topPublications.map((p) => `<tr><td class="nowrap">${escapeHtml(p.publicId)}</td><td>${escapeHtml(p.title)}</td>
          <td>${escapeHtml(p.ownerName)}</td><td>${escapeHtml(p.departmentCode || '')}</td><td class="num">${p.year}</td><td class="num">${p.citations}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="state">No verified publications match these filters.</div>'}`;

    content.querySelector('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      clearFlash();
      const range = readYearRange(e.target);
      if (range.error) return showFlash('error', range.error);
      Object.assign(state, range, { departmentId: e.target.elements.departmentId.value });
      history.replaceState(null, '', window.location.pathname + queryString(state));
      load();
    });
  }
}
