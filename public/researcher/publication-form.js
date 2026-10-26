// W02 Add / Edit Publication (UC-004). Field rules come from /js/validation.js (window.RPValidation).
import { api } from '/js/api.js';
import { escapeHtml, badge, TYPE_LABELS, idFromPath } from '/js/format.js';
import { initPage, setHeader, showFlash, clearFlash, storeFlash, renderApiFailure, openDialog, confirmDialog } from '/js/layout.js';

const V = window.RPValidation;
const editId = idFromPath(/^\/researcher\/publications\/(\d+)\/edit\/?$/);

const page = await initPage({
  active: 'publications',
  title: editId ? 'Edit publication' : 'Add Publication',
  subtitle: editId ? '' : 'Manual entry',
  breadcrumb: [['My Publications', '/researcher/publications'], [editId ? 'Edit' : 'Add publication']],
  roles: ['RESEARCHER'],
});

if (page) {
  const { content } = page;
  let pub = null; // the stored record once it exists
  let saving = false;

  if (editId) {
    loadExisting();
  } else {
    renderForm();
  }

  async function loadExisting() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const { publication } = await api('GET', `/api/publications/${editId}`);
      pub = publication;
      setHeader({
        title: `Edit ${escapeHtml(pub.publicId)} ${badge(pub.status)}`,
        breadcrumb: [['My Publications', '/researcher/publications'], [pub.publicId], ['Edit']],
      });
      if (pub.status !== 'DRAFT_ENTERED' && pub.status !== 'REJECTED') {
        content.innerHTML = `<div class="state">${escapeHtml(pub.publicId)} is ${escapeHtml(pub.status)} and can no longer be edited.
          <a href="/researcher/dashboard">Back to dashboard</a></div>`;
        return;
      }
      let reason = null;
      if (pub.status === 'REJECTED') {
        const { verifications } = await api('GET', `/api/publications/${editId}/reviews`);
        const last = [...verifications].reverse().find((v) => v.decision === 'REJECTED');
        reason = last ? last.comments : null;
      }
      renderForm(pub, reason);
    } catch (err) {
      renderApiFailure(err, content, 'The publication could not be loaded.', loadExisting);
    }
  }

  function field(name, label, inputHtml, { span2 = false, hint = '' } = {}) {
    return `<div class="field${span2 ? ' span2' : ''}" data-field="${name}">
        <label for="f-${name}">${label}</label>
        ${inputHtml}
        ${hint ? `<div class="hint">${hint}</div>` : ''}
      </div>`;
  }

  function renderForm(p = null, rejectReason = null) {
    const val = (k) => escapeHtml(p && p[k] !== null && p[k] !== undefined ? p[k] : '');
    content.innerHTML = `
      ${rejectReason !== null && p && p.status === 'REJECTED'
        ? `<div class="box info" id="reject-info" style="margin-bottom:14px">This record was rejected: '${escapeHtml(rejectReason)}'.
             Saving your changes moves it back to DRAFT_ENTERED so you can resubmit it.</div>`
        : ''}
      <p class="muted">Fields marked * are required.</p>
      <div id="error-summary"></div>
      <form class="box" id="pub-form" novalidate>
        <div class="form-grid">
          ${field('title', 'Title *', `<input id="f-title" name="title" maxlength="400" value="${val('title')}">`, { span2: true })}
          ${field('authors', 'Authors *', `<input id="f-authors" name="authors" value="${val('authors')}">`, { span2: true, hint: 'Separate names with commas' })}
          ${field('publicationType', 'Publication type *', `<select id="f-publicationType" name="publicationType">
              <option value="">Select…</option>
              ${V.PUBLICATION_TYPES.map((t) => `<option value="${t}"${p && p.publicationType === t ? ' selected' : ''}>${TYPE_LABELS[t]}</option>`).join('')}
            </select>`)}
          ${field('venue', 'Venue / journal', `<input id="f-venue" name="venue" value="${val('venue')}">`)}
          ${field('year', 'Year *', `<input id="f-year" name="year" inputmode="numeric" value="${val('year')}">`)}
          ${field('citationCount', 'Citation count', `<input id="f-citationCount" name="citationCount" type="number" min="0" step="1" value="${p ? p.citationCount : 0}">`, { hint: 'Blank counts as 0' })}
          ${field('doiLink', 'DOI / link', `<input id="f-doiLink" name="doiLink" placeholder="10.xxxx/… or https://…" value="${val('doiLink')}">`, { span2: true })}
        </div>
        <div class="form-actions" id="form-actions">
          <button type="submit" class="btn btn-primary">Save as draft</button>
          <a class="btn" href="/researcher/dashboard">Cancel</a>
        </div>
      </form>`;
    content.querySelector('#pub-form').addEventListener('submit', (e) => {
      e.preventDefault();
      save(false);
    });
  }

  function readForm() {
    const form = content.querySelector('#pub-form');
    const data = {};
    for (const name of ['title', 'authors', 'publicationType', 'venue', 'year', 'citationCount', 'doiLink']) {
      data[name] = form.elements[name].value;
    }
    return data;
  }

  function clearErrors() {
    content.querySelector('#error-summary').innerHTML = '';
    content.querySelectorAll('.field.invalid').forEach((f) => {
      f.classList.remove('invalid');
      const msg = f.querySelector('.error-text');
      if (msg) msg.remove();
    });
  }

  function showErrors(errors) {
    clearErrors();
    const names = Object.keys(errors);
    const n = names.length;
    content.querySelector('#error-summary').innerHTML =
      `<div class="error-summary" role="alert"><strong>Please correct ${n} ${n === 1 ? 'field' : 'fields'}.</strong> Nothing has been saved yet.</div>`;
    for (const name of names) {
      const f = content.querySelector(`.field[data-field="${name}"]`);
      if (!f) continue;
      f.classList.add('invalid');
      const msg = document.createElement('div');
      msg.className = 'error-text';
      msg.textContent = errors[name];
      const hint = f.querySelector('.hint');
      f.insertBefore(msg, hint);
    }
    const first = content.querySelector('.field.invalid input, .field.invalid select');
    if (first) first.focus();
  }

  async function save(confirmDuplicate) {
    if (saving) return;
    clearFlash();
    clearErrors();
    const data = readForm();
    const check = V.validateFields(data); // quick feedback; the server checks again
    if (!check.valid) {
      showErrors(check.errors);
      return;
    }
    saving = true;
    try {
      const qs = `?confirmDuplicate=${confirmDuplicate ? 'true' : 'false'}`;
      const res = pub
        ? await api('PUT', `/api/publications/${pub.id}${qs}`, { ...data, version: pub.version })
        : await api('POST', `/api/publications${qs}`, data);
      onSaved(res.publication);
    } catch (err) {
      if (err.code === 'VALIDATION_FAILED') {
        showErrors(err.body.fieldErrors || {});
      } else if (err.code === 'DUPLICATE_WARNING') {
        saving = false;
        const choice = await duplicateDialog(err.body.duplicates || []);
        if (choice === 'save') return save(true);
        content.querySelector('#f-title').focus();
      } else if (err.code === 'CONCURRENT_UPDATE') {
        showFlash('error', 'This record was changed elsewhere. Reload the page and try again.', { label: 'Reload', onClick: () => window.location.reload() });
      } else if (err.status >= 500 || err.status === 0) {
        showFlash('error', 'The publication could not be saved. Nothing was changed.', { label: 'Retry', onClick: () => save(confirmDuplicate) });
      } else {
        showFlash('error', err.message);
      }
    } finally {
      saving = false;
    }
  }

  function duplicateDialog(duplicates) {
    return openDialog({
      title: 'Possible duplicate',
      bodyHtml: `<p>A publication with the same DOI / title and year already exists in your records:</p>
        <ul>${duplicates.map((d) => `<li>${escapeHtml(d.publicId)} — ${escapeHtml(d.title)} (${d.year}) ${badge(d.status)}</li>`).join('')}</ul>`,
      buttons: [
        { label: 'Edit details', value: 'edit', primary: true },
        { label: 'Save anyway', value: 'save' },
      ],
    });
  }

  /** "Saved" state: the form stays on screen read-only with Submit / Back buttons. */
  function onSaved(p) {
    pub = p;
    history.replaceState(null, '', `/researcher/publications/${p.id}/edit`);
    setHeader({
      title: `Edit ${escapeHtml(p.publicId)} ${badge(p.status)}`,
      breadcrumb: [['My Publications', '/researcher/publications'], [p.publicId], ['Edit']],
      subtitle: '',
    });
    const info = content.querySelector('#reject-info');
    if (info) info.remove();
    content.querySelectorAll('#pub-form input, #pub-form select').forEach((el) => { el.disabled = true; });
    showFlash('success', `${p.publicId} saved as draft (DRAFT_ENTERED).`);
    const actions = content.querySelector('#form-actions');
    actions.innerHTML = `
      <button type="button" class="btn btn-primary" id="submit-btn">Submit for verification</button>
      <a class="btn" href="/researcher/dashboard">Back to dashboard</a>`;
    actions.querySelector('#submit-btn').addEventListener('click', submit);
  }

  async function submit() {
    const ok = await confirmDialog({
      title: 'Submit for verification',
      text: `Submit ${pub.publicId} for verification? You cannot edit it while it is being reviewed.`,
      confirmLabel: 'Submit',
    });
    if (!ok) return;
    try {
      await api('POST', `/api/publications/${pub.id}/submit`);
      storeFlash('success', `${pub.publicId} submitted for verification. Research administrators have been notified.`);
      window.location.href = '/researcher/dashboard';
    } catch (err) {
      if (err.status >= 500 || err.status === 0) {
        showFlash('error', `${pub.publicId} could not be submitted. Nothing was changed.`, { label: 'Retry', onClick: submit });
      } else {
        showFlash('error', err.message);
      }
    }
  }
}
