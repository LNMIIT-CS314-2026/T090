// W01 Researcher Dashboard.
import { api } from '/js/api.js';
import { escapeHtml, fmtDateTime } from '/js/format.js';
import { initPage, setHeader, renderApiFailure } from '/js/layout.js';
import { mountPublicationList } from '/researcher/pubtable.js';

const page = await initPage({ active: 'dashboard', title: 'My Dashboard', roles: ['RESEARCHER'] });

if (page) {
  const { me, content } = page;
  setHeader({ subtitle: `${me.user.name}, ${me.user.departmentName || ''}` });
  content.innerHTML = '<div id="metrics-area"><div class="state">Loading…</div></div><div id="list-area"></div>';
  const metricsArea = content.querySelector('#metrics-area');
  mountPublicationList(content.querySelector('#list-area'));
  loadMetrics();

  async function loadMetrics() {
    metricsArea.innerHTML = '<div class="state">Loading…</div>';
    try {
      const view = await api('GET', '/api/dashboards/individual/me');
      renderMetrics(view);
    } catch (err) {
      renderApiFailure(err, metricsArea, 'Your impact metrics could not be loaded.', loadMetrics);
    }
  }

  function renderMetrics({ metrics: m, trend }) {
    const h = m.hIndex;
    metricsArea.innerHTML = `
      <div class="metrics">
        <div class="metric"><div class="label">Total citations</div><div class="value">${m.totalCitations}</div><div class="def">verified records only</div></div>
        <div class="metric"><div class="label">h-index</div><div class="value">${h}</div><div class="def">${h} ${h === 1 ? 'paper' : 'papers'} with ≥ ${h} citations</div></div>
        <div class="metric"><div class="label">i10-index</div><div class="value">${m.i10Index}</div><div class="def">papers with ≥ 10 citations</div></div>
        <div class="metric chart"><div class="label">Verified publications per year</div>${miniChart(trend)}</div>
      </div>
      ${m.verifiedCount === 0
        ? '<div class="box info" style="margin-top:12px">None of your publications has been verified yet, so all metrics are 0.</div>'
        : `<p class="note">Metrics last computed ${escapeHtml(fmtDateTime(m.computedAt))} — <a href="/researcher/metrics">open Impact Metrics</a></p>`}`;
  }

  /** Last five years as plain div bars, year labels underneath. */
  function miniChart(trend) {
    const current = new Date().getFullYear();
    const years = [];
    for (let y = current - 4; y <= current; y++) years.push(y);
    const counts = years.map((y) => trend[y] || 0);
    const max = Math.max(1, ...counts);
    return `<div class="minibars" aria-label="Verified publications per year">
        ${years.map((y, i) => `<div class="bar-col" title="${y}: ${counts[i]}"><div class="bar${counts[i] ? '' : ' zero'}" style="height:${Math.round((counts[i] / max) * 100)}%"></div></div>`).join('')}
      </div>
      <div class="minibars-labels">${years.map((y) => `<span>${y}</span>`).join('')}</div>`;
  }
}
