'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/** bcrypt only reads the first 72 bytes, so hash a digest of the password instead. */
const prehash = (password) => crypto.createHash('sha256').update(password, 'utf8').digest('base64');

function createAuthService({ users, jwtSecret, jwtExpiresIn = '7d' }) {
  const dummyHash = bcrypt.hashSync(prehash('not-a-real-password'), 10);

  const signToken = (user) =>
    jwt.sign({ sub: String(user.id), name: user.username }, jwtSecret, { algorithm: 'HS256', expiresIn: jwtExpiresIn });

  return {
    signToken,

    /** Returns { user, token }, or null if the username is taken. */
    async register(username, password) {
      if (await users.findByUsername(username)) return null;
      const hash = await bcrypt.hash(prehash(password), 10);
      const id = await users.create(username, hash);
      if (id === null) return null;
      const user = { id, username };
      return { token: signToken(user), user };
    },

    /** Returns { user, token }, or null for a wrong username or password. */
    async login(username, password, { validUsername }) {
      const row = validUsername ? await users.findByUsername(username) : null;
      // Always run one bcrypt compare so a missing user takes as long as a wrong password.
      const ok = await bcrypt.compare(prehash(password), row ? row.password_hash : dummyHash);
      if (!row || !ok) return null;
      const user = { id: row.id, username: row.username };
      return { token: signToken(user), user };
    },

    /** Returns the user from a "Bearer <jwt>" header (re-checked in the database) or null. */
    async userFromHeader(header) {
      const m = /^Bearer (.+)$/.exec(header || '');
      if (!m) return null;
      let payload;
      try {
        payload = jwt.verify(m[1], jwtSecret, { algorithms: ['HS256'] });
      } catch {
        return null;
      }
      const id = Number.parseInt(payload.sub, 10);
      if (!Number.isInteger(id)) return null;
      return users.findById(id);
    },
  };
}

module.exports = { createAuthService, prehash };
