'use strict';
// Roles and the field rules for accounts and profiles (FR-004, FR-006, FR-007, FR-008, FR-009). No I/O.

const ROLES = ['RESEARCHER', 'RESEARCH_ADMIN', 'HOD', 'INSTITUTE_MGMT', 'SYSTEM_ADMIN'];
const ROLE_LABELS = {
  RESEARCHER: 'Researcher',
  RESEARCH_ADMIN: 'Research Administrator',
  HOD: 'Head of Department',
  INSTITUTE_MGMT: 'Institute Management',
  SYSTEM_ADMIN: 'System Administrator',
};
/** Roles that belong to a department (FR-008). The others work for the whole institute. */
const DEPARTMENT_ROLES = ['RESEARCHER', 'HOD'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,18}$/;

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Profile fields a user may change themselves (FR-006, FR-007). */
function validateProfile(d) {
  d = d || {};
  const errors = {};
  const name = str(d.name);
  if (!name) errors.name = 'Name is required.';
  else if (name.length > 100) errors.name = 'Name must be at most 100 characters.';
  if (str(d.designation).length > 100) errors.designation = 'Designation must be at most 100 characters.';
  if (str(d.researchAreas).length > 300) errors.researchAreas = 'Research areas must be at most 300 characters.';
  const phone = str(d.phone);
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Enter a phone number with 7 to 19 digits, for example +91 141 2689 000.';
  return { valid: Object.keys(errors).length === 0, errors };
}

/** A new account created by the system administrator (FR-004, FR-008). */
function validateNewUser(d) {
  d = d || {};
  const errors = { ...validateProfile(d).errors };
  if (!EMAIL_RE.test(str(d.email))) errors.email = 'Enter a valid e-mail address.';
  if (!ROLES.includes(str(d.role))) errors.role = 'Select a role.';
  else if (DEPARTMENT_ROLES.includes(str(d.role)) && !str(d.departmentId)) errors.departmentId = 'Select a department for this role.';
  if (str(d.password).length < 8) errors.password = 'The initial password must have at least 8 characters.';
  return { valid: Object.keys(errors).length === 0, errors };
}

function toProfileData(d) {
  return {
    name: str(d.name),
    designation: str(d.designation) || null,
    researchAreas: str(d.researchAreas) || null,
    phone: str(d.phone) || null,
  };
}

module.exports = { ROLES, ROLE_LABELS, DEPARTMENT_ROLES, validateProfile, validateNewUser, toProfileData };
