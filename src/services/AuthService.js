'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { AppError, MESSAGES } = require('../domain/errors');

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2-hour sliding expiry
// Compared against when the e-mail is unknown, so both failure cases take the same time (FR-002).
const DUMMY_HASH = bcrypt.hashSync('researchpulse-no-such-user', 10);

/** C4 Authentication & Access Control (IAuth). Sessions live in memory (SRS 40.6). */
class AuthService {
  constructor({ users }) {
    this.users = users; // UserDirectoryService
    this.sessions = new Map(); // token → { token, userId, role, expiresAt }
  }

  login(email, password) {
    const user = this.users.findUserByEmail(String(email || '').trim());
    const ok = bcrypt.compareSync(String(password || ''), user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) throw new AppError('UNAUTHENTICATED', MESSAGES.WRONG_LOGIN);
    if (user.accountStatus !== 'ACTIVE') throw new AppError('ACCESS_DENIED', MESSAGES.DEACTIVATED);

    const token = crypto.randomBytes(32).toString('hex');
    const session = { token, userId: user.id, role: user.role, expiresAt: Date.now() + SESSION_TTL_MS };
    this.sessions.set(token, session);
    return { token, session, user };
  }

  logout(token) {
    if (token) this.sessions.delete(token);
  }

  /** Ends every session of one user, e.g. after a role change or deactivation (FR-004, FR-009). */
  endSessionsFor(userId) {
    for (const [token, s] of this.sessions) if (s.userId === userId) this.sessions.delete(token);
  }

  authenticate(token) {
    const session = token ? this.sessions.get(token) : null;
    if (!session) throw new AppError('UNAUTHENTICATED', MESSAGES.SESSION_EXPIRED);
    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      throw new AppError('UNAUTHENTICATED', MESSAGES.SESSION_EXPIRED);
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  }

  /** Throws ACCESS_DENIED if the role is wrong or the account is no longer active. Returns the user. */
  authorize(session, roles, message = MESSAGES.NO_PERMISSION) {
    const allowed = Array.isArray(roles) ? roles : [roles];
    if (!session || !allowed.includes(session.role)) throw new AppError('ACCESS_DENIED', message);
    const user = this.users.findUser(session.userId);
    if (!user || user.accountStatus !== 'ACTIVE') throw new AppError('ACCESS_DENIED', MESSAGES.DEACTIVATED);
    return user;
  }
}

module.exports = { AuthService, SESSION_TTL_MS };
