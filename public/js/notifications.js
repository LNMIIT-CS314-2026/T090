// Notification list shared by /researcher/notifications and /admin/notifications.
import { api } from './api.js';
import { escapeHtml, fmtDateTime } from './format.js';
import { initPage, showFlash, setUnread, renderApiFailure } from './layout.js';

/** recordHref(n) gives the link to the record (W05 for researchers, W04 for administrators). */
export async function mountNotificationsPage({ role, recordHref }) {
  const page = await initPage({ active: 'notifications', title: 'Notifications', subtitle: 'Newest first.', roles: [role] });
  if (!page) return;
  const { content } = page;
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const { notifications, unreadCount } = await api('GET', '/api/notifications');
      setUnread(unreadCount);
      render(notifications, unreadCount);
    } catch (err) {
      renderApiFailure(err, content, 'Your notifications could not be loaded.', load);
    }
  }

  function render(list, unreadCount) {
    if (list.length === 0) {
      content.innerHTML = '<div class="state">You have no notifications.</div>';
      return;
    }
    content.innerHTML = `
      <div class="section-head">
        <span class="muted">${unreadCount} unread</span>
        <button type="button" class="btn" id="read-all"${unreadCount ? '' : ' disabled'}>Mark all as read</button>
      </div>
      <div class="table-wrap"><ul class="notif-list">
        ${list.map((n) => `<li class="${n.readStatus === 'UNREAD' ? 'unread' : ''}">
            <div class="msg">${n.readStatus === 'UNREAD' ? '<span class="label-new">New</span>' : ''}${escapeHtml(n.message)}</div>
            <div class="meta">${escapeHtml(fmtDateTime(n.createdAt))}
              ${n.type === 'MILESTONE'
                ? ` · <a href="/researcher/metrics" data-id="${n.id}" data-unread="${n.readStatus === 'UNREAD' ? 1 : 0}">Open impact metrics</a>`
                : n.publicationId ? ` · <a href="${recordHref(n)}" data-id="${n.id}" data-unread="${n.readStatus === 'UNREAD' ? 1 : 0}">Open ${escapeHtml(n.publicId || 'record')}</a>` : ' · <span class="muted">record deleted</span>'}
            </div>
          </li>`).join('')}
      </ul></div>`;

    content.querySelector('#read-all').addEventListener('click', async () => {
      try {
        await api('POST', '/api/notifications/read-all');
        await load();
      } catch (err) {
        showFlash('error', 'The notifications could not be updated. Retry.');
      }
    });
    content.querySelectorAll('a[data-id]').forEach((a) => {
      a.addEventListener('click', async (e) => {
        if (a.dataset.unread !== '1') return;
        e.preventDefault();
        try { await api('POST', `/api/notifications/${a.dataset.id}/read`); } catch { /* still open the record */ }
        window.location.href = a.getAttribute('href');
      });
    });
  }
}
