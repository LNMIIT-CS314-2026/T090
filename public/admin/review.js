// W04 Verification Detail (UC-006 steps 22–26 and the rejection flow).
import { api } from '/js/api.js';
import { escapeHtml, badge, fmtDate, fmtDateTime, TYPE_LABELS, doiHref, idFromPath } from '/js/format.js';
import { initPage, setHeader, showFlash, clearFlash, storeFlash, renderApiFailure, confirmDialog, getMe } from '/js/layout.js';

const NOT_AUTHORISED = 'You do not have permission to verify publication data.';
const id = idFromPath(/^\/admin\/publications\/(\d+)\/?$/);

const page = await initPage({
  active: 'queue',
  title: 'Verification detail',
  breadcrumb: [['Verification Queue', '/admin/queue']],
  roles: ['RESEARCH_ADMIN'],
  forbiddenMessage: NOT_AUTHORISED,
});

if (page) {
  const { content } = page;
  let pub = null;
  let busy = false;
  load();

  async function load() {
    clearFlash();
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      let { publication } = await api('GET', `/api/publications/${id}`);
      if (publication.status === 'SUBMITTED') {
        // Opened directly (not through Review): open it now, as the queue would (T7).
        await api('POST', `/api/verification-queue/${id}/open`);
        ({ publication } = await api('GET', `/api/publications/${id}`));
      }
      const reviews = await api('GET', `/api/publications/${id}/reviews`);
      pub = publication;
      render(publication, reviews);
    } catch (err) {
      renderApiFailure(err, content, 'The record could not be loaded.', load);
    }
  }

  function render(p, { verifications }) {
    setHeader({
      title: `${escapeHtml(p.publicId)} — ${escapeHtml(p.title)} ${badge(p.status)}`,
      breadcrumb: [['Verification Queue', '/admin/queue'], [p.publicId]],
    });
    const href = doiHref(p.doiLink);
    const dupCell = p.verifiedDuplicate
      ? `<span class="text-danger">Matches verified record ${escapeHtml(p.verifiedDuplicate.publicId)} — ${escapeHtml(p.verifiedDuplicate.title)} (${p.verifiedDuplicate.year})</span>`
      : 'No verified record with the same DOI or title + year';
    const me = getMe();
    const openedByOther = p.status === 'UNDER_REVIEW' && p.reviewerId && me && p.reviewerId !== me.user.id;

    content.innerHTML = `
      <div class="two-col">
        <div>
          <div class="table-wrap"><table class="kv">
            <caption>Record as submitted by ${escapeHtml(p.ownerName)} (${escapeHtml(p.departmentCode || '—')}) on ${escapeHtml(fmtDate(p.submittedAt))}</caption>
            <tr><th>Authors</th><td>${escapeHtml(p.authors)}</td></tr>
            <tr><th>Type / venue</th><td>${escapeHtml(TYPE_LABELS[p.publicationType] || p.publicationType)}${p.venue ? ' — ' + escapeHtml(p.venue) : ''}</td></tr>
            <tr><th>Year</th><td>${p.year}</td></tr>
            <tr><th>DOI / link</th><td>${p.doiLink ? (href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(p.doiLink)}</a>` : escapeHtml(p.doiLink)) : '<span class="muted">—</span>'}</td></tr>
            <tr><th>Citation count</th><td>${p.citationCount}</td></tr>
            <tr><th>Duplicate check</th><td>${dupCell}${p.duplicateFlag ? '<div class="note" style="margin-top:4px"><span class="badge badge-flag">Possible duplicate</span> The researcher saved this record despite a duplicate warning.</div>' : ''}</td></tr>
          </table></div>

          <h2>Review history</h2>
          ${verifications.length
            ? `<div class="box"><ul class="history">${verifications.map((v) => `<li>
                  <span class="when">${escapeHtml(fmtDateTime(v.decisionDate))}</span>${badge(v.decision)}
                  <span class="muted small">by ${escapeHtml(v.administratorName)}</span>
                  ${v.comments ? `<div class="quote" style="flex-basis:100%">${escapeHtml(v.comments)}</div>` : ''}
                </li>`).join('')}</ul></div>`
            : '<p class="muted">No earlier decisions on this record.</p>'}
        </div>

        <div>${p.status === 'UNDER_REVIEW' ? decisionPanel(openedByOther ? p.reviewerName : null) : decidedPanel(p, verifications)}</div>
      </div>`;

    if (p.status === 'UNDER_REVIEW') wireDecisionPanel();
  }

  function decisionPanel(otherReviewer) {
    return `<div class="box decision-panel">
        <h3>Decision</h3>
        ${otherReviewer ? `<p class="note" style="margin-top:0">Opened for review by ${escapeHtml(otherReviewer)}.</p>` : ''}
        <div class="field">
          <label for="comment">Comment (optional when verifying)</label>
          <textarea id="comment" maxlength="2000"></textarea>
        </div>
        <button type="button" class="btn btn-primary btn-block" id="verify-btn">Verify publication</button>
        <div class="divider"></div>
        <div class="field" id="reason-field">
          <label for="reason">Rejection reason (required to reject)</label>
          <textarea id="reason" maxlength="2000"></textarea>
        </div>
        <button type="button" class="btn btn-danger btn-block" id="reject-btn">Reject publication</button>
        <div class="divider"></div>
        <a class="btn" href="/admin/queue">Back to queue</a>
      </div>`;
  }

  function decidedPanel(p, verifications) {
    const last = verifications[verifications.length - 1];
    if (!last || (p.status !== 'VERIFIED' && p.status !== 'REJECTED')) {
      return `<div class="box"><h3>Decision</h3><p class="muted">This record is ${escapeHtml(p.status)} and is not under review.</p>
        <a class="btn" href="/admin/queue">Back to queue</a></div>`;
    }
    const verb = last.decision === 'VERIFIED' ? 'Verified' : 'Rejected';
    return `<div class="box decision-box ${last.decision === 'VERIFIED' ? 'verified' : 'rejected'}">
        <h3>Decision</h3>
        <div class="who">${verb} by ${escapeHtml(last.administratorName)} on ${escapeHtml(fmtDateTime(last.decisionDate))}</div>
        ${last.comments ? `<div style="margin-top:8px"><strong>${last.decision === 'VERIFIED' ? 'Comment' : 'Reason'}</strong></div><div class="quote">${escapeHtml(last.comments)}</div>` : ''}
        <p class="note">This record has been decided and is shown read-only.</p>
        <a class="btn" href="/admin/queue">Back to queue</a>
      </div>`;
  }

  function wireDecisionPanel() {
    const reasonField = content.querySelector('#reason-field');
    const reason = content.querySelector('#reason');
    const comment = content.querySelector('#comment');

    function setReasonError(msg) {
      reasonField.classList.toggle('invalid', !!msg);
      const old = reasonField.querySelector('.error-text');
      if (old) old.remove();
      if (msg) {
        const div = document.createElement('div');
        div.className = 'error-text';
        div.textContent = msg;
        reasonField.appendChild(div);
      }
    }
    reason.addEventListener('input', () => { if (reason.value.trim()) setReasonError(null); });

    content.querySelector('#verify-btn').addEventListener('click', async () => {
      setReasonError(null);
      const ok = await confirmDialog({
        title: 'Verify publication',
        text: `Verify ${pub.publicId}? It will count in ${pub.ownerName}'s impact metrics and the researcher will be notified.`,
        confirmLabel: 'Verify',
      });
      if (ok) verify(comment.value);
    });

    content.querySelector('#reject-btn').addEventListener('click', () => {
      if (!reason.value.trim()) {
        setReasonError('A rejection reason is required.'); // no request is sent; the server checks again
        reason.focus();
        return;
      }
      reject(reason.value);
    });

    async function verify(text) {
      if (busy) return;
      busy = true;
      try {
        const { metrics: m } = await api('POST', `/api/publications/${pub.id}/verify`, { comments: text, version: pub.version });
        storeFlash('success', `${pub.publicId} verified. Metrics recomputed: ${m.totalCitations} citations, h-index ${m.hIndex}, i10-index ${m.i10Index}. Researcher notified.`);
        window.location.href = '/admin/queue';
      } catch (err) {
        handleError(err, () => verify(text));
      } finally {
        busy = false;
      }
    }

    async function reject(text) {
      if (busy) return;
      busy = true;
      try {
        await api('POST', `/api/publications/${pub.id}/reject`, { reason: text, version: pub.version });
        storeFlash('success', `${pub.publicId} rejected. The reason was sent to the researcher; metrics unchanged.`);
        window.location.href = '/admin/queue';
      } catch (err) {
        if (err.code === 'REASON_REQUIRED') setReasonError(err.message);
        else handleError(err, () => reject(text));
      } finally {
        busy = false;
      }
    }

    function handleError(err, retry) {
      if (err.code === 'DUPLICATE_OF_VERIFIED') {
        showFlash('error', 'Cannot verify: a VERIFIED record of the same researcher has the same DOI / title and year. Reject this record as a duplicate.');
      } else if (err.code === 'INVALID_STATE' || err.code === 'CONCURRENT_UPDATE') {
        showFlash('error', 'This record is no longer under review (decided by another administrator).', { label: 'Reload', onClick: load });
      } else if (err.status >= 500 || err.status === 0) {
        showFlash('error', 'The decision could not be saved. Nothing was changed.', { label: 'Retry', onClick: retry });
      } else {
        showFlash('error', err.message);
      }
      window.scrollTo(0, 0);
    }
  }
}
