// W03 Verification Queue (UC-006 steps 20–22).
import { api } from '/js/api.js';
import { escapeHtml, fmtDate, fmtDateTime, TYPE_SHORT } from '/js/format.js';
import { initPage, showFlash, renderApiFailure } from '/js/layout.js';

const NOT_AUTHORISED = 'You do not have permission to verify publication data.';

const page = await initPage({
  active: 'queue',
  title: 'Verification Queue',
  subtitle: 'Publications submitted by researchers, oldest first.',
  roles: ['RESEARCH_ADMIN'],
  forbiddenMessage: NOT_AUTHORISED,
});

if (page) {
  const { content } = page;
  content.innerHTML = `
    <form class="toolbar" id="queue-filter" role="search" style="margin-top:0">
      <div class="filters">
        <select id="dept" aria-label="Department"><option value="">Department: All</option></select>
        <input type="search" id="q" placeholder="Title or researcher…" aria-label="Search the queue">
        <button type="submit" class="btn">Filter</button>
      </div>
    </form>
    <div id="queue-area"><div class="state">Loading…</div></div>`;

  const area = content.querySelector('#queue-area');
  const deptSel = content.querySelector('#dept');
  const q = content.querySelector('#q');
  content.querySelector('#queue-filter').addEventListener('submit', (e) => {
    e.preventDefault();
    load();
  });

  api('GET', '/api/departments')
    .then(({ departments }) => {
      deptSel.insertAdjacentHTML('beforeend', departments.map((d) => `<option value="${d.id}">${escapeHtml(d.code)} — ${escapeHtml(d.name)}</option>`).join(''));
    })
    .catch(() => { /* the filter just stays at "All" */ });

  load();

  async function load() {
    area.innerHTML = '<div class="state">Loading…</div>';
    const params = new URLSearchParams();
    if (deptSel.value) params.set('departmentId', deptSel.value);
    if (q.value.trim()) params.set('text', q.value.trim());
    try {
      const queue = await api('GET', '/api/verification-queue?' + params.toString());
      render(queue, params.toString() !== '');
    } catch (err) {
      renderApiFailure(err, area, 'The verification queue could not be loaded.', load);
    }
  }

  function rows(items, buttonLabel, dateField) {
    return items.map((p) => `<tr>
        <td class="nowrap">${escapeHtml(p.publicId)}</td>
        <td>${escapeHtml(p.title)}</td>
        <td class="nowrap">${escapeHtml(p.ownerName)}</td>
        <td>${escapeHtml(p.departmentCode || '—')}</td>
        <td class="nowrap">${escapeHtml(TYPE_SHORT[p.publicationType] || p.publicationType)}</td>
        <td class="num">${p.year}</td>
        <td class="nowrap" title="${escapeHtml(fmtDateTime(p[dateField]))}">${escapeHtml(fmtDate(p[dateField]))}</td>
        <td>${p.duplicateFlag ? '<span class="badge badge-flag">Possible duplicate</span>' : '<span class="muted">—</span>'}</td>
        <td><button type="button" class="btn btn-sm btn-primary" data-id="${p.id}">${buttonLabel}</button></td>
      </tr>`).join('');
  }

  function table(items, buttonLabel, dateLabel, dateField) {
    return `<div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Title</th><th>Researcher</th><th>Dept</th><th>Type</th><th class="num">Year</th><th>${dateLabel}</th><th>Flags</th><th></th></tr></thead>
        <tbody>${rows(items, buttonLabel, dateField)}</tbody>
      </table></div>`;
  }

  function render({ pending, inReview }, filtered) {
    area.innerHTML = `
      <h2 style="margin-top:0">Pending verification <span class="muted" style="font-weight:400">(${pending.length} pending, oldest first)</span></h2>
      ${pending.length
        ? table(pending, 'Review', 'Submitted', 'submittedAt')
        : `<div class="state">${filtered ? 'No pending publications match the filter.' : 'Nothing to verify. There are no publications waiting for verification.'}</div>`}
      <h2>In review (opened by you)</h2>
      ${inReview.length
        ? table(inReview, 'Continue review', 'Submitted', 'submittedAt')
        : '<div class="state">You have no records open for review.</div>'}
      <p class="note">Only records in SUBMITTED status are listed as pending. Review opens the record and moves it to UNDER_REVIEW.</p>`;

    area.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => openForReview(btn));
    });
  }

  async function openForReview(btn) {
    btn.disabled = true;
    try {
      await api('POST', `/api/verification-queue/${btn.dataset.id}/open`);
      window.location.href = `/admin/publications/${btn.dataset.id}`;
    } catch (err) {
      btn.disabled = false;
      showFlash('error', err.code === 'INVALID_STATE' || err.code === 'CONCURRENT_UPDATE'
        ? 'This record is no longer waiting for verification (opened or decided by another administrator).'
        : err.message, { label: 'Reload', onClick: load });
    }
  }
}
