// FR-029 Department dashboard (UC-010) with filters by year range and researcher (FR-033).
// A Head of Department sees only their own department (BR-006); administrators and management choose one.
import { api } from '/js/api.js';
import { escapeHtml, TYPE_SHORT } from '/js/format.js';
import { initPage, setHeader, showFlash, clearFlash, renderApiFailure } from '/js/layout.js';
import { trendChart, hbar } from '/js/charts.js';
import { yearRangeFields, readYearRange, rangeLabel, queryString } from '/js/filters.js';

const page = await initPage({
  active: 'department',
  title: 'Department dashboard',
  roles: ['HOD', 'RESEARCH_ADMIN', 'INSTITUTE_MGMT'],
});

if (page) {
  const { me, content } = page;
  const isHod = me.user.role === 'HOD';
  const params = new URLSearchParams(window.location.search);
  const state = {
    dept: isHod ? 'mine' : params.get('dept') || null,
    researcherId: params.get('researcherId') || '',
    yearFrom: params.get('yearFrom') || null,
    yearTo: params.get('yearTo') || null,
  };
  let departments = [];
  start();

  async function start() {
    if (!isHod) {
      try {
        departments = (await api('GET', '/api/departments')).departments;
      } catch (err) {
        return renderApiFailure(err, content, 'The departments could not be loaded.', start);
      }
      if (!state.dept && departments.length) state.dept = String(departments[0].id);
    }
    load();
  }

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    const q = queryString({ researcherId: state.researcherId, yearFrom: state.yearFrom, yearTo: state.yearTo });
    try {
      render(await api('GET', `/api/dashboards/department/${state.dept}${q}`));
    } catch (err) {
      renderApiFailure(err, content, 'The department dashboard could not be loaded.', load);
    }
  }

  function render(v) {
    const d = v.department;
    setHeader({
      title: `${escapeHtml(d.name)} <span class="muted" style="font-weight:400">(${escapeHtml(d.code)})</span>`,
      subtitle: `Department dashboard${d.headName ? ` · Head of Department: ${d.headName}` : ''} · verified publications only, ${rangeLabel(v.range)}`,
    });
    const t = v.totals;
    const maxC = Math.max(0, ...v.researchers.map((r) => r.citations));
    content.innerHTML = `
      <form class="filter-bar" id="filters">
        ${isHod ? '' : `<label class="inline-field">Department
          <select name="dept">${departments.map((x) => `<option value="${x.id}"${String(x.id) === String(d.id) ? ' selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select></label>`}
        <label class="inline-field">Researcher
          <select name="researcherId"><option value="">All researchers</option>
            ${v.allResearchers.map((r) => `<option value="${r.id}"${String(r.id) === String(v.researcherId || '') ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
          </select></label>
        ${yearRangeFields(v.range)}
        <button type="submit" class="btn">Apply</button>
        <a class="btn" href="/dashboards/compare">Compare researchers</a>
      </form>

      <div class="metrics">
        <div class="metric"><div class="label">Researchers</div><div class="value">${t.researcherCount}</div><div class="def">${v.researcherId ? 'selected researcher' : 'in this department'}</div></div>
        <div class="metric"><div class="label">Verified publications</div><div class="value">${t.publications}</div><div class="def">${rangeLabel(v.range)}</div></div>
        <div class="metric"><div class="label">Total citations</div><div class="value">${t.citations}</div><div class="def">of these publications</div></div>
        <div class="metric"><div class="label">Department h-index</div><div class="value">${t.hIndex}</div><div class="def">i10-index ${t.i10Index}</div></div>
      </div>
      ${t.publications === 0 ? '<div class="box info" style="margin-top:12px">No verified publications match these filters.</div>' : ''}

      <div class="two-col">
        <div>
          <h2>Researchers</h2>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Researcher</th><th class="num">Verified</th><th class="num">Citations</th><th class="num">h-index</th><th class="num">i10-index</th></tr></thead>
            <tbody>${v.researchers.map((r) => `<tr>
                <td>${escapeHtml(r.name)}${r.accountStatus === 'DEACTIVATED' ? ' <span class="muted">(deactivated)</span>' : ''}<div class="muted small">${escapeHtml(r.designation || '')}</div></td>
                <td class="num">${r.publications}</td>
                <td class="num nowrap">${r.citations}${hbar(r.citations, maxC)}</td>
                <td class="num">${r.hIndex}</td><td class="num">${r.i10Index}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No researchers in this department.</td></tr>'}
            </tbody></table></div>
          <p class="note">By type: ${Object.entries(t.byType).map(([k, n]) => `${escapeHtml(TYPE_SHORT[k])} ${n}`).join(' · ') || '—'}</p>
        </div>
        <div>
          <h2>Publication trend</h2>
          <div class="box">${trendChart(v.trend)}</div>
        </div>
      </div>

      <h2>Verified publications <span class="muted" style="font-weight:400">(${v.publications.length}, most cited first)</span></h2>
      ${v.publications.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Title</th><th>Researcher</th><th>Type</th><th class="num">Year</th><th class="num">Cit.</th></tr></thead>
        <tbody>${v.publications.map((p) => `<tr><td class="nowrap">${escapeHtml(p.publicId)}</td><td>${escapeHtml(p.title)}</td>
          <td>${escapeHtml(p.ownerName)}</td><td>${escapeHtml(TYPE_SHORT[p.publicationType])}</td><td class="num">${p.year}</td><td class="num">${p.citations}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="state">No verified publications.</div>'}`;

    content.querySelector('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      clearFlash();
      const f = e.target;
      const range = readYearRange(f);
      if (range.error) return showFlash('error', range.error);
      const deptChanged = !isHod && f.elements.dept.value !== String(d.id);
      Object.assign(state, range, {
        dept: isHod ? 'mine' : f.elements.dept.value,
        researcherId: deptChanged ? '' : f.elements.researcherId.value,
      });
      history.replaceState(null, '', window.location.pathname + queryString({
        dept: isHod ? null : state.dept, researcherId: state.researcherId, yearFrom: state.yearFrom, yearTo: state.yearTo,
      }));
      load();
    });
  }
}
