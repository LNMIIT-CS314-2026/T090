// W05 Verification Outcome (UC-006 step 26, FR-022).
import { api } from '/js/api.js';
import { escapeHtml, badge, fmtDateTime, TYPE_LABELS, doiHref, idFromPath } from '/js/format.js';
import { initPage, setHeader, storeFlash, showFlash, renderApiFailure, confirmDialog, refreshUnread } from '/js/layout.js';

const id = idFromPath(/^\/researcher\/publications\/(\d+)\/outcome\/?$/);
const page = await initPage({
  active: 'publications',
  title: 'Verification outcome',
  breadcrumb: [['My Publications', '/researcher/publications']],
  roles: ['RESEARCHER'],
});

if (page) {
  const { content } = page;
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const [{ publication: p }, reviews] = await Promise.all([
        api('GET', `/api/publications/${id}`),
        api('GET', `/api/publications/${id}/reviews`),
      ]);
      render(p, reviews);
      markNotificationsRead(p.id);
    } catch (err) {
      renderApiFailure(err, content, 'The publication could not be loaded.', load);
    }
  }

  function decisionBox(p, verifications) {
    const last = verifications[verifications.length - 1];
    if (p.status === 'REJECTED' && last && last.decision === 'REJECTED') {
      return `<div class="box decision-box rejected">
          <div class="who">Rejected by ${escapeHtml(last.administratorName)} on ${escapeHtml(fmtDateTime(last.decisionDate))}</div>
          <div style="margin-top:8px"><strong>Reason</strong></div>
          <div class="quote">${escapeHtml(last.comments)}</div>
        </div>`;
    }
    if (p.status === 'VERIFIED' && last && last.decision === 'VERIFIED') {
      return `<div class="box decision-box verified">
          <div class="who">Verified by ${escapeHtml(last.administratorName)} on ${escapeHtml(fmtDateTime(last.decisionDate))}</div>
          ${last.comments ? `<div style="margin-top:8px"><strong>Comment</strong></div><div class="quote">${escapeHtml(last.comments)}</div>` : ''}
          <p class="note">This publication counts in your impact metrics.</p>
        </div>`;
    }
    const waiting = { DRAFT_ENTERED: 'This record is a draft and has not been submitted yet.', SUBMITTED: 'This record is waiting in the verification queue.', UNDER_REVIEW: 'A research administrator is reviewing this record.' };
    return `<div class="box decision-box">${escapeHtml(waiting[p.status] || 'No decision has been made on this record yet.')}</div>`;
  }

  function render(p, { verifications, history }) {
    setHeader({
      title: `${escapeHtml(p.publicId)} — ${escapeHtml(p.title)} ${badge(p.status)}`,
      breadcrumb: [['My Publications', '/researcher/publications'], [p.publicId]],
    });
    const href = doiHref(p.doiLink);
    content.innerHTML = `
      ${decisionBox(p, verifications)}

      <div class="btn-row" style="margin-top:14px">
        ${p.status === 'REJECTED'
          ? `<a class="btn btn-primary" href="/researcher/publications/${p.id}/edit">Correct and resubmit</a>
             <button type="button" class="btn btn-danger" id="delete-btn">Delete</button>`
          : ''}
        ${p.status === 'VERIFIED' ? '<a class="btn btn-primary" href="/researcher/metrics">View impact metrics</a>' : ''}
        <a class="btn" href="/researcher/dashboard">Back to dashboard</a>
      </div>
      ${p.status === 'REJECTED' ? '<p class="note">Rejected records do not count in your metrics. After correction the record returns to DRAFT_ENTERED (FR-022).</p>' : ''}

      <div class="two-col" style="margin-top:20px">
        <div>
          <h2 style="margin-top:0">Record details</h2>
          <div class="table-wrap"><table class="kv">
            <tr><th>Authors</th><td>${escapeHtml(p.authors)}</td></tr>
            <tr><th>Type / venue</th><td>${escapeHtml(TYPE_LABELS[p.publicationType] || p.publicationType)}${p.venue ? ' — ' + escapeHtml(p.venue) : ''}</td></tr>
            <tr><th>Year</th><td>${p.year}</td></tr>
            <tr><th>DOI / link</th><td>${p.doiLink ? (href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(p.doiLink)}</a>` : escapeHtml(p.doiLink)) : '<span class="muted">—</span>'}</td></tr>
            <tr><th>Citation count</th><td>${p.citationCount}</td></tr>
          </table></div>
        </div>
        <div>
          <h2 style="margin-top:0">Status history</h2>
          <div class="box"><ul class="history">
            ${history.map((h) => `<li>
                <span class="when">${escapeHtml(fmtDateTime(h.at))}</span>
                ${h.fromStatus ? badge(h.fromStatus) + ' →' : '<span class="muted">created →</span>'} ${badge(h.toStatus)}
                <span class="muted small">by ${escapeHtml(h.actorName)}</span>
              </li>`).join('')}
          </ul></div>
        </div>
      </div>`;

    const del = content.querySelector('#delete-btn');
    if (del) {
      del.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete publication', text: `Delete ${p.publicId}? This cannot be undone.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        try {
          await api('DELETE', `/api/publications/${p.id}`);
          storeFlash('success', `${p.publicId} deleted.`);
          window.location.href = '/researcher/dashboard';
        } catch (err) {
          showFlash('error', err.status >= 500 || err.status === 0 ? `${p.publicId} could not be deleted. Nothing was changed.` : err.message);
        }
      });
    }
  }

  /** Opening this page marks this record's notifications as read. */
  async function markNotificationsRead(publicationId) {
    try {
      const { notifications } = await api('GET', '/api/notifications');
      const unread = notifications.filter((n) => n.publicationId === publicationId && n.readStatus === 'UNREAD');
      for (const n of unread) await api('POST', `/api/notifications/${n.id}/read`);
      if (unread.length) refreshUnread();
    } catch { /* not important for this page */ }
  }
}
