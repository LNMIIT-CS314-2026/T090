// Common layout: top bar, page header, flash messages, page states and confirmation dialogs.
import { api } from './api.js';
import { escapeHtml, roleLabel, homeFor } from './format.js';

const MENUS = {
  RESEARCHER: [
    ['dashboard', 'Dashboard', '/researcher/dashboard'],
    ['publications', 'My Publications', '/researcher/publications'],
    ['metrics', 'Impact Metrics', '/researcher/metrics'],
    ['notifications', 'Notifications', '/researcher/notifications'],
  ],
  RESEARCH_ADMIN: [
    ['queue', 'Verification Queue', '/admin/queue'],
    ['notifications', 'Notifications', '/admin/notifications'],
  ],
  HOD: [['home', 'Home', '/hod/home']],
};
const NOTIFICATION_PAGE = { RESEARCHER: '/researcher/notifications', RESEARCH_ADMIN: '/admin/notifications' };

const BELL_SVG =
  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
  '<path d="M8 2.2c-2.2 0-3.8 1.7-3.8 3.9v2.6L3 10.6h10l-1.2-1.9V6.1C11.8 3.9 10.2 2.2 8 2.2z"/>' +
  '<path d="M6.6 12.4c.3.7.8 1 1.4 1s1.1-.3 1.4-1"/></svg>';

const FOOTER = 'ResearchPulse · CS314 Software Development Laboratory · Team T090 · Prototype';

let els = {};
let currentMe = null;

/**
 * Renders the page shell, loads the current user and returns { me, content }.
 * If `roles` is given and the user has another role, the 403 panel is shown and null is returned.
 */
export async function initPage({ active, title, subtitle = '', breadcrumb = null, roles = null, forbiddenMessage } = {}) {
  document.body.innerHTML = `
    <header class="topbar"><div class="topbar-inner">
      <a class="wordmark" href="/">ResearchPulse</a>
      <nav class="nav" aria-label="Main menu"></nav>
      <div class="topbar-right"></div>
    </div></header>
    <main class="container">
      <div class="breadcrumb" hidden></div>
      <h1></h1>
      <p class="subline" hidden></p>
      <div id="flash-area"></div>
      <div id="content"><div class="state">Loading…</div></div>
    </main>
    <footer class="footer"><div class="footer-inner">${FOOTER}</div></footer>`;
  els = {
    nav: document.querySelector('.nav'),
    right: document.querySelector('.topbar-right'),
    breadcrumb: document.querySelector('.breadcrumb'),
    title: document.querySelector('main h1'),
    subtitle: document.querySelector('.subline'),
    flash: document.getElementById('flash-area'),
    content: document.getElementById('content'),
  };
  setHeader({ title, subtitle, breadcrumb });

  let me;
  try {
    me = await api('GET', '/api/auth/me');
  } catch (err) {
    renderError(els.content, 'The page could not be loaded.', () => window.location.reload());
    return null;
  }
  currentMe = me;
  renderTopbar(me, active);
  showStoredFlash();

  if (roles && !roles.includes(me.user.role)) {
    renderForbidden(forbiddenMessage);
    return null;
  }
  return { me, content: els.content };
}

function renderTopbar(me, active) {
  const menu = MENUS[me.user.role] || [];
  els.nav.innerHTML = menu
    .map(([key, label, href]) => `<a href="${href}"${key === active ? ' class="active" aria-current="page"' : ''}>${escapeHtml(label)}</a>`)
    .join('');
  const notifHref = NOTIFICATION_PAGE[me.user.role];
  els.right.innerHTML = `
    ${notifHref ? `<a class="bell" href="${notifHref}" title="Notifications" aria-label="Notifications">${BELL_SVG}<span id="unread-pill"></span></a>` : ''}
    <span class="user-label">${escapeHtml(me.user.name)} · ${escapeHtml(roleLabel(me.user.role))}</span>
    <button type="button" class="btn btn-sm" id="logout-btn">Logout</button>`;
  setUnread(me.unreadCount);
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
    try { sessionStorage.removeItem('rp_logged_in'); } catch { /* ignore */ }
    window.location.href = '/login';
  });
}

export function setHeader({ title, subtitle, breadcrumb }) {
  if (title !== undefined) els.title.innerHTML = title; // callers escape dynamic parts
  if (subtitle !== undefined) {
    els.subtitle.textContent = subtitle || '';
    els.subtitle.hidden = !subtitle;
  }
  if (breadcrumb !== undefined) {
    els.breadcrumb.hidden = !breadcrumb;
    els.breadcrumb.innerHTML = breadcrumb
      ? breadcrumb.map(([label, href]) => (href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label))).join(' › ')
      : '';
  }
}

export function setUnread(count) {
  const pill = document.getElementById('unread-pill');
  if (!pill) return;
  pill.innerHTML = count > 0 ? `<span class="pill">${count}</span>` : '';
}

export async function refreshUnread() {
  try {
    const me = await api('GET', '/api/auth/me');
    setUnread(me.unreadCount);
  } catch { /* not important */ }
}

export function getMe() {
  return currentMe;
}

// ---------- flash messages ----------

/** Shows a message under the title. `action` = { label, onClick } adds a link such as Retry. */
export function showFlash(type, text, action) {
  const div = document.createElement('div');
  div.className = `flash ${type}`;
  div.setAttribute('role', type === 'error' ? 'alert' : 'status');
  div.innerHTML = `<div class="flash-text">${escapeHtml(text)}${action ? ` <a href="#" class="flash-action">${escapeHtml(action.label)}</a>` : ''}</div>
    <button type="button" class="close" aria-label="Dismiss">×</button>`;
  div.querySelector('.close').addEventListener('click', () => div.remove());
  if (action) {
    div.querySelector('.flash-action').addEventListener('click', (e) => {
      e.preventDefault();
      div.remove();
      action.onClick();
    });
  }
  els.flash.innerHTML = '';
  els.flash.appendChild(div);
}

export function clearFlash() {
  if (els.flash) els.flash.innerHTML = '';
}

/** Stores a message to show on the next page (passed across a redirect). */
export function storeFlash(type, text) {
  try { sessionStorage.setItem('rp_flash', JSON.stringify({ type, text })); } catch { /* ignore */ }
}

function showStoredFlash() {
  try {
    const raw = sessionStorage.getItem('rp_flash');
    if (!raw) return;
    sessionStorage.removeItem('rp_flash');
    const { type, text } = JSON.parse(raw);
    showFlash(type, text);
  } catch { /* ignore */ }
}

// ---------- page states ----------

export function renderLoading(el) {
  el.innerHTML = '<div class="state">Loading…</div>';
}

export function renderError(el, message, retry) {
  el.innerHTML = `<div class="state error" role="alert">${escapeHtml(message)} ${retry ? '<a href="#" class="retry">Retry</a>' : ''}</div>`;
  if (retry) {
    el.querySelector('.retry').addEventListener('click', (e) => {
      e.preventDefault();
      retry();
    });
  }
}

export function renderForbidden(message) {
  const role = currentMe ? currentMe.user.role : null;
  els.content.innerHTML = `<div class="state forbidden" role="alert">
      <div class="state-title">${escapeHtml(message || 'You do not have permission to view this page.')}</div>
      <a href="${homeFor(role)}">Back to my dashboard</a>
    </div>`;
}

/** Handles an ApiError that ends the page: 403 panel or the given error text with Retry. */
export function renderApiFailure(err, el, message, retry) {
  if (err.status === 403) return renderForbidden(err.message);
  if (err.status === 404) {
    el.innerHTML = `<div class="state">${escapeHtml(err.message)} <a href="${homeFor(currentMe && currentMe.user.role)}">Back to my dashboard</a></div>`;
    return;
  }
  renderError(el, message, retry);
}

// ---------- dialogs ----------

/**
 * Opens a modal <dialog>. buttons: [{ label, value, primary, danger }]. Resolves with the chosen value
 * (or null when closed with Escape).
 */
export function openDialog({ title, bodyHtml, buttons }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = `<div class="modal-body"><p class="modal-title">${escapeHtml(title)}</p>${bodyHtml}</div>
      <div class="modal-actions">${buttons
        .map((b, i) => `<button type="button" data-i="${i}" class="btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}">${escapeHtml(b.label)}</button>`)
        .join('')}</div>`;
    document.body.appendChild(dlg);
    let value = null;
    dlg.querySelectorAll('.modal-actions button').forEach((btn) => {
      btn.addEventListener('click', () => {
        value = buttons[Number(btn.dataset.i)].value;
        dlg.close();
      });
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(value);
    });
    dlg.showModal();
    const primary = dlg.querySelector('.btn-primary, .btn-danger');
    if (primary) primary.focus();
  });
}

export async function confirmDialog({ title, text, confirmLabel = 'Confirm', danger = false }) {
  const v = await openDialog({
    title,
    bodyHtml: `<p>${escapeHtml(text)}</p>`,
    buttons: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, value: true, primary: !danger, danger },
    ],
  });
  return v === true;
}
