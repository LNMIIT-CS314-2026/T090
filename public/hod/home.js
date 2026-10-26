// HoD home: a read-only department summary (BR-006). Mainly demonstrates role-based access.
import { api } from '/js/api.js';
import { escapeHtml } from '/js/format.js';
import { initPage, setHeader, renderApiFailure } from '/js/layout.js';

const page = await initPage({ active: 'home', title: 'Home', roles: ['HOD'] });

if (page) {
  const { me, content } = page;
  setHeader({
    title: `Welcome, ${escapeHtml(me.user.name)}`,
    subtitle: `Head of Department, ${me.user.departmentName || ''}`,
  });
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const s = await api('GET', '/api/dashboards/department');
      content.innerHTML = `
        <h2 style="margin-top:0">${escapeHtml(s.department.name)} (${escapeHtml(s.department.code)}) — summary</h2>
        <div class="metrics">
          <div class="metric"><div class="label">Researchers</div><div class="value">${s.researcherCount}</div><div class="def">in this department</div></div>
          <div class="metric"><div class="label">Verified publications</div><div class="value">${s.verifiedCount}</div><div class="def">department researchers only</div></div>
          <div class="metric"><div class="label">Total citations</div><div class="value">${s.totalCitations}</div><div class="def">of verified publications</div></div>
        </div>
        <p class="note">Department and institute dashboards (FR-029, FR-030) are planned for the next increment.</p>`;
    } catch (err) {
      renderApiFailure(err, content, 'The department summary could not be loaded.', load);
    }
  }
}
