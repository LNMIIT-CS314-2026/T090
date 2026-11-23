// Plain inline-SVG charts shared by W06 and the dashboards (no chart library, instruction.md section 0).

/** Inline SVG bar chart of verified publications per year, with axis labels and counts on the bars. */
export function trendChart(trend, { label = 'Verified publications per year' } = {}) {
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

  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">
      ${grid}
      <line class="axis" x1="${left}" x2="${W - right}" y1="${top + plotH}" y2="${top + plotH}"/>
      ${bars}
      <text x="${left + plotW / 2}" y="${H - 4}" text-anchor="middle">Year of publication</text>
      <text x="12" y="${top + plotH / 2}" text-anchor="middle" transform="rotate(-90 12 ${top + plotH / 2})">Verified</text>
    </svg>`;
}

/** Horizontal bar for a table cell: value relative to max. */
export function hbar(value, max) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<span class="hbar" aria-hidden="true"><span style="width:${pct}%"></span></span>`;
}
