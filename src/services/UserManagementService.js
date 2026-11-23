'use strict';
const bcrypt = require('bcryptjs');
const { AppError, MESSAGES } = require('../domain/errors');
const { ROLES, DEPARTMENT_ROLES, validateProfile, validateNewUser, toProfileData } = require('../domain/users');

function invalid(errors) {
  return new AppError('VALIDATION_FAILED', MESSAGES.validationSummary(Object.keys(errors).length), { fieldErrors: errors });
}

function accountView(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    accountStatus: u.accountStatus,
    departmentId: u.departmentId,
    departmentCode: u.departmentCode,
    departmentName: u.departmentName,
    designation: u.designation,
    researchAreas: u.researchAreas,
    phone: u.phone,
    publicationCount: u.publicationCount,
  };
}

/**
 * C11 User & Department Management. Profile (FR-006, FR-007, FR-008) for the signed-in user;
 * accounts, roles and deactivation (FR-004, FR-005, FR-009) for the system administrator.
 * Account changes are written to the audit log (NFR-019).
 */
class UserManagementService {
  constructor({ uow, userRepo, auth, audit }) {
    Object.assign(this, { uow, userRepo, auth, audit });
  }

  getProfile(session) {
    const u = this.auth.authorize(session, ROLES);
    return accountView(u);
  }

  /** Name, designation, research areas and phone. E-mail, role and department are managed by the administrator. */
  updateProfile(session, data) {
    const u = this.auth.authorize(session, ROLES);
    const v = validateProfile(data);
    if (!v.valid) throw invalid(v.errors);
    this.userRepo.updateProfile(u.id, toProfileData(data));
    return accountView(this.userRepo.findById(u.id));
  }

  listUsers(session) {
    this.auth.authorize(session, 'SYSTEM_ADMIN');
    return { users: this.userRepo.listAll().map(accountView), departments: this.userRepo.listDepartments() };
  }

  createUser(session, data) {
    const admin = this.auth.authorize(session, 'SYSTEM_ADMIN');
    const v = validateNewUser(data);
    if (!v.valid) throw invalid(v.errors);
    const email = String(data.email).trim().toLowerCase();
    const role = String(data.role);
    const departmentId = DEPARTMENT_ROLES.includes(role) ? Number(data.departmentId) : null;

    return this.uow.run(() => {
      if (this.userRepo.findByEmail(email)) throw invalid({ email: MESSAGES.EMAIL_TAKEN });
      if (departmentId && !this.userRepo.findDepartment(departmentId)) throw invalid({ departmentId: MESSAGES.DEPARTMENT_NOT_FOUND });
      if (role === 'HOD') this.assertHeadFree(departmentId, null);
      const id = this.userRepo.insertUser({
        ...toProfileData(data),
        email,
        passwordHash: bcrypt.hashSync(String(data.password), 10),
        role,
        departmentId,
      });
      if (role === 'HOD') this.userRepo.setDepartmentHead(departmentId, id);
      this.audit.record('CREATE_USER', admin.id, `U-${id}`, `${email} as ${role}`);
      return accountView(this.userRepo.findById(id));
    });
  }

  /** FR-004: assign a role (and the department for researchers and heads of department, FR-008). */
  changeRole(session, id, { role, departmentId } = {}) {
    const admin = this.auth.authorize(session, 'SYSTEM_ADMIN');
    return this.uow.run(() => {
      const u = this.loadOther(admin, id);
      if (!ROLES.includes(role)) throw invalid({ role: 'Select a role.' });
      const deptId = DEPARTMENT_ROLES.includes(role) ? Number(departmentId) || null : null;
      if (DEPARTMENT_ROLES.includes(role)) {
        if (!deptId) throw invalid({ departmentId: 'Select a department for this role.' });
        if (!this.userRepo.findDepartment(deptId)) throw invalid({ departmentId: MESSAGES.DEPARTMENT_NOT_FOUND });
      }
      // Publications stay with their owner, so an owner cannot stop being a researcher (BR-001, BR-004).
      if (u.role === 'RESEARCHER' && role !== 'RESEARCHER' && this.userRepo.countPublications(u.id) > 0) {
        throw new AppError('INVALID_STATE', MESSAGES.ROLE_HAS_PUBLICATIONS);
      }
      if (role === 'HOD') this.assertHeadFree(deptId, u.id);

      this.userRepo.clearDepartmentHead(u.id);
      this.userRepo.updateRole(u.id, role, deptId);
      if (role === 'HOD') this.userRepo.setDepartmentHead(deptId, u.id);
      this.audit.record('CHANGE_ROLE', admin.id, `U-${u.id}`, `${u.role} → ${role}${deptId ? ` (department ${deptId})` : ''}`);
      this.auth.endSessionsFor(u.id); // the new role applies from the next login
      return accountView(this.userRepo.findById(u.id));
    });
  }

  /** FR-009: deactivate (or reactivate) an account. A deactivated user cannot log in or submit (BR-009). */
  setAccountStatus(session, id, status) {
    const admin = this.auth.authorize(session, 'SYSTEM_ADMIN');
    if (!['ACTIVE', 'DEACTIVATED'].includes(status)) throw invalid({ accountStatus: 'Select ACTIVE or DEACTIVATED.' });
    return this.uow.run(() => {
      const u = this.loadOther(admin, id);
      if (u.accountStatus !== status) {
        if (status === 'ACTIVE' && u.role === 'HOD') this.assertHeadFree(u.departmentId, u.id);
        this.userRepo.setAccountStatus(u.id, status);
        this.audit.record(status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE', admin.id, `U-${u.id}`, u.email);
        if (status === 'DEACTIVATED') this.auth.endSessionsFor(u.id);
      }
      return accountView(this.userRepo.findById(u.id));
    });
  }

  loadOther(admin, id) {
    const u = this.userRepo.findById(id);
    if (!u) throw new AppError('NOT_FOUND', MESSAGES.USER_NOT_FOUND);
    if (u.id === admin.id) throw new AppError('INVALID_STATE', MESSAGES.OWN_ACCOUNT);
    return u;
  }

  /** One active Head of Department per department. */
  assertHeadFree(departmentId, exceptUserId) {
    const dept = this.userRepo.findDepartment(departmentId);
    if (!dept || !dept.headUserId || dept.headUserId === exceptUserId) return;
    const head = this.userRepo.findById(dept.headUserId);
    if (head && head.role === 'HOD' && head.accountStatus === 'ACTIVE') {
      throw new AppError('INVALID_STATE', MESSAGES.HEAD_TAKEN(dept.name));
    }
  }
}

module.exports = { UserManagementService };
