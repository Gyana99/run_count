'use strict';

/** All SQL for the users table. */
function createUserRepository(pool) {
  return {
    async findByUsername(username) {
      const [rows] = await pool.execute('SELECT id, username, password_hash FROM users WHERE username = ?', [username]);
      return rows[0] || null;
    },

    async findById(id) {
      const [rows] = await pool.execute('SELECT id, username FROM users WHERE id = ?', [id]);
      return rows[0] || null;
    },

    /** Returns the new id, or null if the username is taken. */
    async create(username, passwordHash) {
      try {
        const [info] = await pool.execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [
          username,
          passwordHash,
        ]);
        return Number(info.insertId);
      } catch (e) {
        if (e && e.code === 'ER_DUP_ENTRY') return null;
        throw e;
      }
    },
  };
}

module.exports = { createUserRepository };
