// My profile (FR-006, FR-007, FR-008): academic and contact details of the signed-in user.
import { api } from '/js/api.js';
import { escapeHtml, roleLabel } from '/js/format.js';
import { initPage, showFlash, clearFlash, renderApiFailure } from '/js/layout.js';

const page = await initPage({ active: 'profile', title: 'My profile', subtitle: 'Academic and contact details' });

if (page) {
  const { content } = page;
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      const { profile } = await api('GET', '/api/profile');
      render(profile);
    } catch (err) {
      renderApiFailure(err, content, 'Your profile could not be loaded.', load);
    }
  }

  function field(name, label, value, { hint, span2 } = {}) {
    return `<div class="field${span2 ? ' span2' : ''}" data-field="${name}">
        <label for="f-${name}">${label}</label>
        <input id="f-${name}" name="${name}" value="${escapeHtml(value ?? '')}">
        ${hint ? `<div class="hint">${hint}</div>` : ''}
      </div>`;
  }

  function render(p) {
    content.innerHTML = `
      <dl class="report-meta box" style="padding:12px 14px">
        <dt>E-mail</dt><dd>${escapeHtml(p.email)}</dd>
        <dt>Role</dt><dd>${escapeHtml(roleLabel(p.role))}</dd>
        <dt>Department</dt><dd>${p.departmentName ? `${escapeHtml(p.departmentName)} (${escapeHtml(p.departmentCode)})` : '—'}</dd>
      </dl>
      <p class="muted">E-mail, role and department are managed by the system administrator. Fields marked * are required.</p>
      <div id="error-summary"></div>
      <form class="box" id="profile-form" novalidate>
        <div class="form-grid">
          ${field('name', 'Name *', p.name)}
          ${field('designation', 'Designation', p.designation, { hint: 'For example Assistant Professor' })}
          ${field('researchAreas', 'Research areas', p.researchAreas, { span2: true, hint: 'Separate areas with commas' })}
          ${field('phone', 'Phone', p.phone, { hint: 'Office or mobile number' })}
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save profile</button></div>
      </form>`;

    const form = content.querySelector('#profile-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFlash();
      clearErrors();
      const data = Object.fromEntries(['name', 'designation', 'researchAreas', 'phone'].map((n) => [n, form.elements[n].value]));
      try {
        const { profile } = await api('PUT', '/api/profile', data);
        render(profile);
        showFlash('success', 'Your profile was saved.');
      } catch (err) {
        if (err.status === 422 && err.body.fieldErrors) showErrors(err.body.fieldErrors);
        else showFlash('error', 'Your profile could not be saved. Nothing was changed. Retry.');
      }
    });
  }

  function clearErrors() {
    content.querySelector('#error-summary').innerHTML = '';
    content.querySelectorAll('.field.invalid').forEach((f) => {
      f.classList.remove('invalid');
      f.querySelector('.error-text')?.remove();
    });
  }

  function showErrors(errors) {
    const n = Object.keys(errors).length;
    content.querySelector('#error-summary').innerHTML =
      `<div class="error-summary" role="alert"><strong>Please correct ${n} ${n === 1 ? 'field' : 'fields'}.</strong> Nothing has been saved yet.</div>`;
    for (const [name, msg] of Object.entries(errors)) {
      const f = content.querySelector(`.field[data-field="${name}"]`);
      if (!f) continue;
      f.classList.add('invalid');
      const div = document.createElement('div');
      div.className = 'error-text';
      div.textContent = msg;
      f.insertBefore(div, f.querySelector('.hint'));
    }
  }
}
