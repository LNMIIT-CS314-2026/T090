// FR-031 Comparison view (UC-012): researchers or departments side by side, over a year range (FR-033).
// A Head of Department compares researchers of their own department only (BR-006).
import { api } from '/js/api.js';
import { escapeHtml } from '/js/format.js';
import { initPage, setHeader, showFlash, clearFlash, renderApiFailure } from '/js/layout.js';
import { hbar } from '/js/charts.js';
import { yearRangeFields, readYearRange, rangeLabel, queryString } from '/js/filters.js';

const page = await initPage({
  active: 'compare',
  title: 'Compare research output',
  subtitle: 'Verified publications only',
  roles: ['HOD', 'RESEARCH_ADMIN', 'INSTITUTE_MGMT'],
});

if (page) {
  const { me, content } = page;
  const isHod = me.user.role === 'HOD';
  const params = new URLSearchParams(window.location.search);
  const state = {
    mode: !isHod && params.get('mode') === 'departments' ? 'departments' : 'researchers',
    ids: params.get('ids') || '',
    yearFrom: params.get('yearFrom') || null,
    yearTo: params.get('yearTo') || null,
  };
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      render(await api('GET', `/api/dashboards/compare${queryString(state)}`));
    } catch (err) {
      renderApiFailure(err, content, 'The comparison could not be loaded.', load);
    }
  }

  function render(v) {
    const chosen = new Set(v.rows.map((r) => r.id));
    const noun = v.mode === 'departments' ? 'departments' : 'researchers';
    setHeader({ subtitle: `Verified publications only, ${rangeLabel(v.range)}${isHod ? ' · researchers of your department' : ''}` });
    content.innerHTML = `
      <form class="box" id="compare-form">
        <div class="filter-bar" style="margin-top:0">
          ${isHod ? '' : `<label class="inline-field">Compare
            <select name="mode">
              <option value="researchers"${v.mode === 'researchers' ? ' selected' : ''}>Researchers</option>
              <option value="departments"${v.mode === 'departments' ? ' selected' : ''}>Departments</option>
            </select></label>`}
          ${yearRangeFields(v.range)}
        </div>
        <div class="muted small">Choose two or more ${noun}:</div>
        <div class="check-list">${v.candidates.map((c) => `<label>
            <input type="checkbox" name="ids" value="${c.id}"${chosen.has(c.id) ? ' checked' : ''}>
            ${escapeHtml(c.label)}${v.mode === 'researchers' && c.group ? ` <span class="muted">(${escapeHtml(c.group)})</span>` : ''}</label>`).join('')}
        </div>
        <button type="submit" class="btn btn-primary">Compare</button>
      </form>
      <div id="out"></div>`;

    const out = content.querySelector('#out');
    if (v.rows.length === 0) {
      out.innerHTML = `<div class="state">Choose the ${noun} to compare and press Compare.</div>`;
    } else {
      const maxC = Math.max(0, ...v.rows.map((r) => r.citations));
      out.innerHTML = `
        <h2>Summary</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>${v.mode === 'departments' ? 'Department' : 'Researcher'}</th><th class="num">Verified</th><th class="num">Citations</th><th class="num">h-index</th><th class="num">i10-index</th></tr></thead>
          <tbody>${v.rows.map((r) => `<tr><td>${escapeHtml(r.label)}${v.mode === 'researchers' ? ` <span class="muted">(${escapeHtml(r.group || '')})</span>` : ''}</td>
            <td class="num">${r.publications}</td><td class="num nowrap">${r.citations}${hbar(r.citations, maxC)}</td>
            <td class="num">${r.hIndex}</td><td class="num">${r.i10Index}</td></tr>`).join('')}</tbody>
        </table></div>
        <h2>Verified publications per year</h2>
        <div class="table-wrap"><table class="data">
          <thead><tr><th></th>${v.years.map((y) => `<th class="num">${y}</th>`).join('')}</tr></thead>
          <tbody>${v.rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td>${v.years.map((y) => `<td class="num">${r.trend[y] || 0}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
        <p class="note">h-index and i10-index here are computed over the publications in the chosen years only, so they can differ from the official all-time values.</p>`;
    }

    const form = content.querySelector('#compare-form');
    if (form.elements.mode) {
      form.elements.mode.addEventListener('change', () => {
        Object.assign(state, { mode: form.elements.mode.value, ids: '' });
        go();
      });
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearFlash();
      const range = readYearRange(form);
      if (range.error) return showFlash('error', range.error);
      const ids = [...form.querySelectorAll('input[name="ids"]:checked')].map((i) => i.value);
      if (ids.length < 2) return showFlash('error', `Choose at least two ${noun} to compare.`);
      Object.assign(state, range, { ids: ids.join(',') });
      go();
    });
  }

  function go() {
    history.replaceState(null, '', window.location.pathname + queryString(state));
    load();
  }
}
