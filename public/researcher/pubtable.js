// Publication toolbar + table shared by W01 (dashboard) and My Publications.
import { api } from '/js/api.js';
import { escapeHtml, badge, STATUSES, TYPE_SHORT } from '/js/format.js';
import { showFlash, renderApiFailure, confirmDialog } from '/js/layout.js';

export function mountPublicationList(container) {
  container.innerHTML = `
    <div class="toolbar">
      <a class="btn btn-primary" href="/researcher/publications/new">+ Add Publication</a>
      <form class="filters" id="pub-filter" role="search">
        <input type="search" id="pub-search" placeholder="Search title / author / year…" aria-label="Search publications">
        <select id="pub-status" aria-label="Status">
          <option value="">Status: All</option>
          ${STATUSES.map((s) => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <button type="submit" class="btn">Search</button>
      </form>
    </div>
    <div id="pub-list"><div class="state">Loading…</div></div>`;

  const list = container.querySelector('#pub-list');
  const search = container.querySelector('#pub-search');
  const statusSel = container.querySelector('#pub-status');

  container.querySelector('#pub-filter').addEventListener('submit', (e) => {
    e.preventDefault();
    load();
  });

  async function load() {
    const text = search.value.trim();
    const params = new URLSearchParams();
    // A four-digit search term is treated as a year (FR-032: search by title, author or year).
    if (/^\d{4}$/.test(text)) params.set('year', text);
    else if (text) params.set('text', text);
    if (statusSel.value) params.set('status', statusSel.value);
    const filtered = params.toString() !== '';

    list.innerHTML = '<div class="state">Loading…</div>';
    try {
      const { publications } = await api('GET', '/api/publications?' + params.toString());
      render(publications, filtered);
    } catch (err) {
      renderApiFailure(err, list, 'Your publications could not be loaded.', load);
    }
  }

  function actionsFor(p) {
    switch (p.status) {
      case 'DRAFT_ENTERED':
        return `<a class="btn btn-sm" href="/researcher/publications/${p.id}/edit">Edit</a>
                <button type="button" class="btn btn-sm btn-primary" data-act="submit" data-id="${p.id}">Submit</button>
                <button type="button" class="btn-text-danger" data-act="delete" data-id="${p.id}">Delete</button>`;
      case 'SUBMITTED':
        return '<span class="muted">awaiting review</span>';
      case 'UNDER_REVIEW':
        return '<span class="muted">in review</span>';
      case 'VERIFIED':
        return `<a class="btn btn-sm" href="/researcher/publications/${p.id}/outcome">View</a>`;
      case 'REJECTED':
        return `<a class="btn btn-sm" href="/researcher/publications/${p.id}/outcome">View reason</a>
                <a class="btn btn-sm" href="/researcher/publications/${p.id}/edit">Edit</a>
                <button type="button" class="btn-text-danger" data-act="delete" data-id="${p.id}">Delete</button>`;
      default:
        return '';
    }
  }

  function render(pubs, filtered) {
    if (pubs.length === 0) {
      list.innerHTML = filtered
        ? '<div class="state">No publications match your search.</div>'
        : `<div class="state"><p>You have not added any publications yet.</p>
             <a class="btn btn-primary" href="/researcher/publications/new">+ Add Publication</a></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>ID</th><th>Title</th><th>Type</th><th class="num">Year</th><th class="num">Cit.</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${pubs
          .map(
            (p) => `<tr>
              <td class="nowrap">${escapeHtml(p.publicId)}</td>
              <td>${escapeHtml(p.title)}</td>
              <td class="nowrap">${escapeHtml(TYPE_SHORT[p.publicationType] || p.publicationType)}</td>
              <td class="num">${p.year}</td>
              <td class="num">${p.citationCount}</td>
              <td>${badge(p.status)}</td>
              <td><div class="actions">${actionsFor(p)}</div></td>
            </tr>`
          )
          .join('')}</tbody>
      </table></div>
      <p class="note">Edit / Delete appear only for DRAFT_ENTERED and REJECTED records.</p>`;

    const byId = new Map(pubs.map((p) => [String(p.id), p]));
    list.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = byId.get(btn.dataset.id);
        if (btn.dataset.act === 'submit') submit(p);
        else remove(p);
      });
    });
  }

  async function submit(p) {
    const ok = await confirmDialog({
      title: 'Submit for verification',
      text: `Submit ${p.publicId} for verification? You cannot edit it while it is being reviewed.`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    try {
      await api('POST', `/api/publications/${p.id}/submit`);
      showFlash('success', `${p.publicId} submitted for verification. Research administrators have been notified.`);
    } catch (err) {
      showFlash('error', err.status >= 500 || err.status === 0 ? `${p.publicId} could not be submitted. Nothing was changed.` : err.message,
        err.status >= 500 || err.status === 0 ? { label: 'Retry', onClick: () => submit(p) } : undefined);
    }
    load();
  }

  async function remove(p) {
    const ok = await confirmDialog({
      title: 'Delete publication',
      text: `Delete ${p.publicId}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await api('DELETE', `/api/publications/${p.id}`);
      showFlash('success', `${p.publicId} deleted.`);
    } catch (err) {
      showFlash('error', err.status >= 500 || err.status === 0 ? `${p.publicId} could not be deleted. Nothing was changed.` : err.message);
    }
    load();
  }

  load();
  return { reload: load };
}
