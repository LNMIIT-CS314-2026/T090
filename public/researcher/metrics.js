// W06 Impact Metrics (results of UC-008).
import { api } from '/js/api.js';
import { escapeHtml, fmtDateTime } from '/js/format.js';
import { initPage, renderApiFailure } from '/js/layout.js';

const page = await initPage({
  active: 'metrics',
  title: 'Impact Metrics',
  subtitle: 'Official values from verified publications only',
  roles: ['RESEARCHER'],
});

if (page) {
  const { content } = page;
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const [view, { publications }] = await Promise.all([
        api('GET', '/api/dashboards/individual/me'),
        api('GET', '/api/publications'),
      ]);
      render(view, publications);
    } catch (err) {
      renderApiFailure(err, content, 'Your impact metrics could not be loaded.', load);
    }
  }

  function render({ metrics: m, trend, rankedVerified }, publications) {
    const notCounted = publications.filter((p) => p.status !== 'VERIFIED').length;
    content.innerHTML = `
      <div class="metrics large">
        <div class="metric"><div class="label">Total citations</div><div class="value">${m.totalCitations}</div>
          <div class="def">Total citations = sum of citations of verified publications</div></div>
        <div class="metric"><div class="label">h-index</div><div class="value">${m.hIndex}</div>
          <div class="def">h-index = largest h such that h papers have ≥ h citations each</div></div>
        <div class="metric"><div class="label">i10-index</div><div class="value">${m.i10Index}</div>
          <div class="def">i10-index = number of papers with ≥ 10 citations</div></div>
      </div>
      ${m.verifiedCount === 0
        ? '<div class="box info" style="margin-top:12px">None of your publications has been verified yet, so all metrics are 0.</div>'
        : `<p class="note">Computed ${escapeHtml(fmtDateTime(m.computedAt))}${m.triggeredBy ? ` · triggered by verification of <strong>${escapeHtml(m.triggeredBy)}</strong>` : ''}</p>`}

      <div class="two-col">
      <div>
      <h2>Counted publications (VERIFIED), ranked by citations</h2>
      ${rankedVerified.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr><th class="num">Rank</th><th>ID</th><th>Title</th><th class="num">Year</th><th class="num">Citations</th><th>Counts for h-index</th></tr></thead>
          <tbody>${rankedVerified.map((r) => `<tr${r.countsForH ? ' class="highlight"' : ''}>
              <td class="num">${r.rank}</td>
              <td class="nowrap">${escapeHtml(r.publicId)}</td>
              <td>${escapeHtml(r.title)}</td>
              <td class="num">${r.year}</td>
              <td class="num">${r.citations}</td>
              <td>${r.countsForH ? `✓ <span class="muted">(${r.citations} ≥ ${r.rank})</span>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="note">${escapeHtml(explainH(rankedVerified, m.hIndex))}</p>` : '<div class="state">No verified publications yet.</div>'}
      ${notCounted ? `<p class="note">${notCounted} ${notCounted === 1 ? 'record' : 'records'} in DRAFT_ENTERED / SUBMITTED / UNDER_REVIEW / REJECTED status ${notCounted === 1 ? 'is' : 'are'} not counted (BR-002).</p>` : ''}
      </div>
      <div>
        <h2>Publication trend <span class="muted" style="font-weight:400">(verified per year)</span></h2>
        <div class="box">${trendChart(trend)}</div>
      </div>
      </div>`;
  }

  /** e.g. "14 ≥ 1, 11 ≥ 2 → h-index = 2." built from the ranked rows. */
  function explainH(rows, h) {
    if (h === 0) return 'No verified paper has at least 1 citation → h-index = 0.';
    const parts = rows.filter((r) => r.countsForH).map((r) => `${r.citations} ≥ ${r.rank}`);
    let text = `${parts.join(', ')} → h-index = ${h}.`;
    const next = rows[h];
    if (next) text += ` The next paper has ${next.citations} < ${next.rank} citations, so h stops at ${h}.`;
    return text;
  }

  /** Inline SVG bar chart of verified publications per year, with axis labels and counts on the bars. */
  function trendChart(trend) {
    const current = new Date().getFullYear();
    let years = Object.keys(trend).map(Number);
    if (years.length === 0) years = [current - 2, current - 1, current];
    const counts = years.map((y) => trend[y] || 0);
    const max = Math.max(1, ...counts);
    const W = 400, H = 230, left = 40, right = 8, top = 18, bottom = 38;
    const plotW = W - left - right, plotH = H - top - bottom;
    const slot = plotW / years.length;
    const barW = Math.min(56, slot * 0.6);
    const ticks = [];
    for (let t = 0; t <= max; t++) ticks.push(t);

    const grid = ticks.map((t) => {
      const y = top + plotH - (t / max) * plotH;
      return `<line class="grid" x1="${left}" x2="${W - right}" y1="${y}" y2="${y}"/><text x="${left - 8}" y="${y + 4}" text-anchor="end">${t}</text>`;
    }).join('');
    const bars = years.map((yr, i) => {
      const c = counts[i];
      const h = (c / max) * plotH;
      const x = left + i * slot + (slot - barW) / 2;
      const y = top + plotH - h;
      return `${c ? `<rect class="bar" x="${x}" y="${y}" width="${barW}" height="${h}"/>` : ''}
        <text class="count" x="${x + barW / 2}" y="${(c ? y : top + plotH) - 5}" text-anchor="middle">${c}</text>
        <text x="${x + barW / 2}" y="${top + plotH + 16}" text-anchor="middle">${yr}</text>`;
    }).join('');

    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verified publications per year">
        ${grid}
        <line class="axis" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"/>
        ${bars}
        <text x="${left + plotW / 2}" y="${H - 4}" text-anchor="middle">Year of publication</text>
        <text x="12" y="${top + plotH / 2}" text-anchor="middle" transform="rotate(-90 12 ${top + plotH / 2})">Verified</text>
      </svg>`;
  }
}
