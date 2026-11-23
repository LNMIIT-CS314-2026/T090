// Import publications from a CSV file (UC-005, FR-014, FR-015). Check first, then import the valid rows.
import { api } from '/js/api.js';
import { escapeHtml } from '/js/format.js';
import { initPage, showFlash, clearFlash, storeFlash, renderApiFailure } from '/js/layout.js';

const MAX_BYTES = 900 * 1024;
const STATUS = {
  OK: '<span class="row-ok">Ready</span>',
  DUPLICATE: '<span class="row-dup">Possible duplicate</span>',
  INVALID: '<span class="row-bad">Not valid</span>',
};

const page = await initPage({
  active: 'publications',
  title: 'Import publications',
  subtitle: 'From a CSV file, for example an export of your bibliography',
  breadcrumb: [['My Publications', '/researcher/publications'], ['Import', null]],
  roles: ['RESEARCHER'],
});

if (page) {
  const { content } = page;
  let csvText = null;

  content.innerHTML = `
    <div class="box">
      <p style="margin-top:0">The first line of the file must name the columns. Required: <strong>title, authors, type, year</strong>.
        Optional: <strong>venue, doi, citations</strong>. Type may be Journal article, Conference paper, Book chapter, Book, Patent or Other.
        <a href="/samples/publications-sample.csv" download>Download a sample file</a>.</p>
      <p class="muted">Every row is checked with the same rules as the Add Publication form. Imported records are saved as
        DRAFT_ENTERED; submit them for verification from My Publications.</p>
      <form id="file-form" class="filter-bar" style="margin-bottom:0">
        <input type="file" id="csv-file" accept=".csv,text/csv" aria-label="CSV file">
        <button type="submit" class="btn btn-primary">Check file</button>
      </form>
    </div>
    <div id="result"></div>`;

  const result = content.querySelector('#result');

  content.querySelector('#file-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFlash();
    const file = content.querySelector('#csv-file').files[0];
    if (!file) return showFlash('error', 'Choose a CSV file first.');
    if (file.size > MAX_BYTES) return showFlash('error', 'The file is larger than 900 KB. Split it into smaller files.');
    csvText = await file.text();
    check();
  });

  async function check() {
    result.innerHTML = '<div class="state">Checking the file…</div>';
    try {
      const preview = await api('POST', '/api/publications/import/preview', { csv: csvText });
      renderPreview(preview);
    } catch (err) {
      if (err.status === 422) {
        result.innerHTML = '';
        showFlash('error', err.message);
      } else renderApiFailure(err, result, 'The file could not be checked.', check);
    }
  }

  function renderPreview({ rows, counts }) {
    const importable = counts.ok + counts.duplicate;
    result.innerHTML = `
      <h2>Check result</h2>
      <p>${counts.ok} ready · ${counts.duplicate} possible ${counts.duplicate === 1 ? 'duplicate' : 'duplicates'} · ${counts.invalid} not valid</p>
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="num">Line</th><th>Title</th><th class="num">Year</th><th>Result</th><th>Details</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td class="num">${r.line}</td><td>${escapeHtml(r.title) || '<span class="muted">(no title)</span>'}</td>
          <td class="num">${escapeHtml(r.year)}</td><td class="nowrap">${STATUS[r.status]}</td><td>${escapeHtml(r.message)}</td></tr>`).join('')}
        </tbody></table></div>
      ${importable ? `
        <div class="form-actions">
          ${counts.duplicate ? `<label class="inline-field"><input type="checkbox" id="incl-dup"> Also import the possible duplicates (they are flagged for the administrator)</label>` : ''}
          <button type="button" class="btn btn-primary" id="do-import">Import ${counts.ok} ${counts.ok === 1 ? 'record' : 'records'}</button>
          <a class="btn" href="/researcher/publications">Cancel</a>
        </div>` : '<div class="state">No row can be imported. Correct the file and check it again.</div>'}`;

    const btn = result.querySelector('#do-import');
    if (!btn) return;
    const incl = result.querySelector('#incl-dup');
    if (incl) {
      incl.addEventListener('change', () => {
        const n = counts.ok + (incl.checked ? counts.duplicate : 0);
        btn.textContent = `Import ${n} ${n === 1 ? 'record' : 'records'}`;
        btn.disabled = n === 0;
      });
      btn.disabled = counts.ok === 0;
    }
    btn.addEventListener('click', () => doImport(incl ? incl.checked : false, btn));
  }

  async function doImport(includeDuplicates, btn) {
    btn.disabled = true;
    try {
      const { imported, skipped } = await api('POST', '/api/publications/import', { csv: csvText, includeDuplicates });
      const ids = imported.map((p) => p.publicId);
      storeFlash('success', `${imported.length} ${imported.length === 1 ? 'record was' : 'records were'} imported as DRAFT_ENTERED (${ids.join(', ')}).`
        + (skipped.length ? ` ${skipped.length} ${skipped.length === 1 ? 'row was' : 'rows were'} not imported.` : '')
        + ' Submit them for verification when ready.');
      window.location.href = '/researcher/publications';
    } catch (err) {
      btn.disabled = false;
      showFlash('error', err.status === 422 ? err.message : 'The records could not be imported. Nothing was changed. Retry.');
    }
  }
}
