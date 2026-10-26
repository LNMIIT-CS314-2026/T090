'use strict';

/** C11 User & Department Management (IUserDirectory): look-ups only. */
class UserDirectoryService {
  constructor({ userRepo }) {
    this.userRepo = userRepo;
  }

  findUser(id) {
    return this.userRepo.findById(id);
  }

  findUserByEmail(email) {
    return this.userRepo.findByEmail(email);
  }

  isActive(id) {
    const u = this.userRepo.findById(id);
    return !!u && u.accountStatus === 'ACTIVE';
  }

  getDepartmentOf(userId) {
    const u = this.userRepo.findById(userId);
    return u && u.departmentId ? this.userRepo.findDepartment(u.departmentId) : null;
  }

  getActiveAdministrators() {
    return this.userRepo.findActiveByRole('RESEARCH_ADMIN');
  }

  getResearchers(departmentId) {
    return this.userRepo.findByDepartmentAndRole(departmentId, 'RESEARCHER');
  }

  listDepartments() {
    return this.userRepo.listDepartments();
  }
}

module.exports = { UserDirectoryService };
