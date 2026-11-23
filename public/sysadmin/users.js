// Manage users and roles (UC-002): create accounts, assign roles and departments (FR-004, FR-008),
// deactivate and reactivate accounts (FR-009). System administrator only.
import { api } from '/js/api.js';
import { escapeHtml, roleLabel, ROLES } from '/js/format.js';
import { initPage, showFlash, clearFlash, renderApiFailure, confirmDialog } from '/js/layout.js';

const DEPARTMENT_ROLES = ['RESEARCHER', 'HOD'];

const page = await initPage({
  active: 'users',
  title: 'Users and roles',
  subtitle: 'Accounts, roles and departments. Changes end the user\'s current session.',
  roles: ['SYSTEM_ADMIN'],
});

if (page) {
  const { me, content } = page;
  load();

  async function load() {
    content.innerHTML = '<div class="state">Loading…</div>';
    try {
      render(await api('GET', '/api/users'));
    } catch (err) {
      renderApiFailure(err, content, 'The user list could not be loaded.', load);
    }
  }

  const roleOptions = (selected) => ROLES.map((r) => `<option value="${r}"${r === selected ? ' selected' : ''}>${escapeHtml(roleLabel(r))}</option>`).join('');
  const deptOptions = (departments, selected) => `<option value="">—</option>` +
    departments.map((d) => `<option value="${d.id}"${d.id === selected ? ' selected' : ''}>${escapeHtml(d.code)}</option>`).join('');

  function render({ users, departments }) {
    content.innerHTML = `
      <details class="box" id="add-box"><summary><strong>Add a user</strong></summary>
        <div id="add-errors"></div>
        <form id="add-form" class="form-grid" novalidate style="margin-top:12px">
          ${field('name', 'Name *', '<input name="name">')}
          ${field('email', 'E-mail *', '<input name="email" type="email" autocomplete="off">')}
          ${field('role', 'Role *', `<select name="role"><option value="">Select…</option>${roleOptions('')}</select>`)}
          ${field('departmentId', 'Department', `<select name="departmentId">${deptOptions(departments, null)}</select>`, 'Required for researchers and heads of department')}
          ${field('designation', 'Designation', '<input name="designation">')}
          ${field('password', 'Initial password *', '<input name="password" type="password" autocomplete="new-password">', 'At least 8 characters; give it to the user personally')}
          <div class="form-actions span2"><button type="submit" class="btn btn-primary">Create account</button></div>
        </form>
      </details>

      <h2>Accounts (${users.length})</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Department</th><th class="num">Pubs</th><th>Status</th><th></th></tr></thead>
        <tbody>${users.map((u) => {
          const self = u.id === me.user.id;
          return `<tr data-id="${u.id}">
            <td>${escapeHtml(u.name)}<div class="muted small">${escapeHtml(u.designation || '')}</div></td>
            <td>${escapeHtml(u.email)}</td>
            <td><select class="role-sel" aria-label="Role of ${escapeHtml(u.name)}"${self ? ' disabled' : ''}>${roleOptions(u.role)}</select></td>
            <td><select class="dept-sel" aria-label="Department of ${escapeHtml(u.name)}"${self ? ' disabled' : ''}>${deptOptions(departments, u.departmentId)}</select></td>
            <td class="num">${u.publicationCount}</td>
            <td>${u.accountStatus === 'ACTIVE' ? 'Active' : '<span class="text-danger">Deactivated</span>'}</td>
            <td class="nowrap">${self ? '<span class="muted">your account</span>' : `
              <button type="button" class="btn btn-sm save-role">Save role</button>
              <button type="button" class="btn btn-sm ${u.accountStatus === 'ACTIVE' ? 'btn-danger' : ''} toggle-status">${u.accountStatus === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>`}
            </td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p class="note">A researcher who owns publications keeps the Researcher role; deactivate the account instead. Each department has one active Head of Department.</p>`;

    content.querySelector('#add-form').addEventListener('submit', (e) => createUser(e, users));
    content.querySelectorAll('tr[data-id]').forEach((tr) => {
      const u = users.find((x) => x.id === Number(tr.dataset.id));
      tr.querySelector('.save-role')?.addEventListener('click', () => saveRole(u, tr));
      tr.querySelector('.toggle-status')?.addEventListener('click', () => toggleStatus(u));
    });
  }

  function field(name, label, control, hint) {
    return `<div class="field" data-field="${name}"><label>${label}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }

  async function createUser(e) {
    e.preventDefault();
    clearFlash();
    const f = e.target;
    f.querySelectorAll('.field.invalid').forEach((x) => { x.classList.remove('invalid'); x.querySelector('.error-text')?.remove(); });
    const data = Object.fromEntries(['name', 'email', 'role', 'departmentId', 'designation', 'password'].map((n) => [n, f.elements[n].value]));
    try {
      const { user } = await api('POST', '/api/users', data);
      await load();
      showFlash('success', `The account of ${user.name} (${roleLabel(user.role)}) was created.`);
    } catch (err) {
      if (err.status === 422 && err.body.fieldErrors) {
        for (const [name, msg] of Object.entries(err.body.fieldErrors)) {
          const fld = f.querySelector(`.field[data-field="${name}"]`);
          if (!fld) continue;
          fld.classList.add('invalid');
          const div = document.createElement('div');
          div.className = 'error-text';
          div.textContent = msg;
          fld.insertBefore(div, fld.querySelector('.hint'));
        }
        showFlash('error', err.message);
      } else showFlash('error', err.status === 409 ? err.message : 'The account could not be created. Nothing was changed. Retry.');
    }
  }

  async function saveRole(u, tr) {
    clearFlash();
    const role = tr.querySelector('.role-sel').value;
    const departmentId = tr.querySelector('.dept-sel').value || null;
    if (DEPARTMENT_ROLES.includes(role) && !departmentId) return showFlash('error', `Select a department for ${u.name}.`);
    const ok = await confirmDialog({
      title: 'Change role',
      text: `Make ${u.name} ${roleLabel(role)}${DEPARTMENT_ROLES.includes(role) ? '' : ' (no department)'}? Their current session ends.`,
      confirmLabel: 'Change role',
    });
    if (!ok) return;
    try {
      await api('PUT', `/api/users/${u.id}/role`, { role, departmentId });
      await load();
      showFlash('success', `${u.name} is now ${roleLabel(role)}.`);
    } catch (err) {
      showFlash('error', [409, 422].includes(err.status) ? err.message : 'The role could not be changed. Nothing was changed. Retry.');
    }
  }

  async function toggleStatus(u) {
    clearFlash();
    const deactivate = u.accountStatus === 'ACTIVE';
    const ok = await confirmDialog({
      title: deactivate ? 'Deactivate account' : 'Activate account',
      text: deactivate
        ? `Deactivate ${u.name}? They are logged out and cannot log in or submit data. Their records are kept.`
        : `Activate ${u.name} again? They can log in with their existing password.`,
      confirmLabel: deactivate ? 'Deactivate' : 'Activate',
      danger: deactivate,
    });
    if (!ok) return;
    try {
      await api('PUT', `/api/users/${u.id}/status`, { accountStatus: deactivate ? 'DEACTIVATED' : 'ACTIVE' });
      await load();
      showFlash('success', `${u.name} was ${deactivate ? 'deactivated' : 'activated'}.`);
    } catch (err) {
      showFlash('error', err.status === 409 ? err.message : 'The account could not be changed. Nothing was changed. Retry.');
    }
  }
}
