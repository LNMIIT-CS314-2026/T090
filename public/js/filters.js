// Year-range filter shared by the dashboards, the comparison view and the reports (FR-033).
import { escapeHtml } from './format.js';

const CURRENT = new Date().getFullYear();

/** Two year inputs. range = { yearFrom, yearTo } (either may be null). */
export function yearRangeFields(range = {}, { required = false } = {}) {
  const input = (name, label, value) => `
    <label class="inline-field">${label}
      <input name="${name}" inputmode="numeric" maxlength="4" size="5" placeholder="${required ? '' : 'any'}"
             value="${escapeHtml(value ?? '')}"${required ? ' required' : ''}>
    </label>`;
  return input('yearFrom', 'From year', range.yearFrom) + input('yearTo', 'to', range.yearTo);
}

/** Reads and checks the two year inputs of a form. Returns { yearFrom, yearTo } or { error }. */
export function readYearRange(form, { required = false } = {}) {
  const read = (name) => String(form.elements[name].value || '').trim();
  const from = read('yearFrom');
  const to = read('yearTo');
  const ok = (v) => v === '' ? !required : /^\d{4}$/.test(v) && Number(v) >= 1900 && Number(v) <= CURRENT;
  if (!ok(from) || !ok(to) || (from && to && Number(from) > Number(to))) {
    return { error: `Enter a year range between 1900 and ${CURRENT}, with the first year not after the last.` };
  }
  return { yearFrom: from || null, yearTo: to || null };
}

/** "all years", "2024–2026", "from 2024", "up to 2025". */
export function rangeLabel({ yearFrom, yearTo } = {}) {
  if (yearFrom && yearTo) return yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}–${yearTo}`;
  if (yearFrom) return `from ${yearFrom}`;
  if (yearTo) return `up to ${yearTo}`;
  return 'all years';
}

export function queryString(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}
