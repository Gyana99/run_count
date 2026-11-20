'use strict';

const LIST_COLUMNS = `
  m.id, m.title, m.venue, m.match_date, m.format, m.status, m.result, m.summary_json, m.version,
  m.updated_at, u.username AS owner_name`;

const LIST_ORDER = `ORDER BY (m.status = 'live') DESC, m.updated_at DESC, m.seq DESC LIMIT 50`;

/** All SQL for the matches table. */
function createMatchRepository(pool) {
  return {
    async exists(id) {
      const [rows] = await pool.execute('SELECT 1 FROM matches WHERE id = ?', [id]);
      return rows.length > 0;
    },

    async findById(id) {
      const [rows] = await pool.execute(
        'SELECT m.*, u.username AS owner_name FROM matches m JOIN users u ON u.id = m.owner_id WHERE m.id = ?',
        [id],
      );
      return rows[0] || null;
    },

    async listPublic() {
      const [rows] = await pool.query(`SELECT ${LIST_COLUMNS} FROM matches m JOIN users u ON u.id = m.owner_id ${LIST_ORDER}`);
      return rows;
    },

    async listByOwner(ownerId) {
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLUMNS} FROM matches m JOIN users u ON u.id = m.owner_id WHERE m.owner_id = ? ${LIST_ORDER}`,
        [ownerId],
      );
      return rows;
    },

    async insert(row) {
      await pool.execute(
        `INSERT INTO matches (id, owner_id, title, venue, match_date, format, status, result, summary_json, state_json, version)
         VALUES (:id, :owner_id, :title, :venue, :match_date, :format, :status, :result, :summary_json, :state_json, 1)`,
        row,
      );
    },

    /** Optimistic update: only applies if the stored version still equals row.version. Returns true if updated. */
    async update(row) {
      const [info] = await pool.execute(
        `UPDATE matches SET title = :title, venue = :venue, match_date = :match_date, format = :format,
           status = :status, result = :result, summary_json = :summary_json, state_json = :state_json,
           version = version + 1, updated_at = CURRENT_TIMESTAMP(3)
         WHERE id = :id AND version = :version`,
        row,
      );
      return info.affectedRows > 0;
    },

    async remove(id) {
      await pool.execute('DELETE FROM matches WHERE id = ?', [id]);
    },
  };
}

module.exports = { createMatchRepository };
