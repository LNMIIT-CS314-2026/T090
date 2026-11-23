// Formatting helpers: escaping, dates (Asia/Kolkata), status badges, labels.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PARTS = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function parts(iso) {
  const out = {};
  for (const p of PARTS.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

/** '15 Sep 2026, 10:32' */
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const p = parts(iso);
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}, ${p.hour}:${p.minute}`;
}

/** '15 Sep 2026' */
export function fmtDate(iso) {
  if (!iso) return '—';
  const p = parts(iso);
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

export const STATUSES = ['DRAFT_ENTERED', 'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'];

export function badge(status) {
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

export const TYPE_SHORT = {
  JOURNAL: 'Journal', CONFERENCE: 'Conference', BOOK_CHAPTER: 'Book chapter', BOOK: 'Book', PATENT: 'Patent', OTHER: 'Other',
};
export const TYPE_LABELS = {
  JOURNAL: 'Journal article', CONFERENCE: 'Conference paper', BOOK_CHAPTER: 'Book chapter', BOOK: 'Book', PATENT: 'Patent', OTHER: 'Other',
};

const ROLE_LABELS = {
  RESEARCHER: 'Researcher',
  RESEARCH_ADMIN: 'Research Administrator',
  HOD: 'Head of Department',
  INSTITUTE_MGMT: 'Institute Management',
  SYSTEM_ADMIN: 'System Administrator',
};
export const ROLES = Object.keys(ROLE_LABELS);
export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

const HOMES = {
  RESEARCHER: '/researcher/dashboard',
  RESEARCH_ADMIN: '/admin/queue',
  HOD: '/dashboards/department',
  INSTITUTE_MGMT: '/dashboards/institute',
  SYSTEM_ADMIN: '/sysadmin/users',
};
export function homeFor(role) {
  return HOMES[role] || '/login';
}

/** Link target for a DOI or URL. */
export function doiHref(value) {
  const v = String(value || '').trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^10\.\d{4,9}\//.test(v)) return 'https://doi.org/' + v;
  return null;
}

/** Numeric publication ID from the current path, e.g. /researcher/publications/12/edit → 12. */
export function idFromPath(pattern) {
  const m = window.location.pathname.match(pattern);
  return m ? Number(m[1]) : null;
}
