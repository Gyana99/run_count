'use strict';

const crypto = require('node:crypto');

const toIso = (d) => (d instanceof Date ? d.toISOString() : d);

/** Row from a list query -> API list item. */
const toListItem = (r) => ({
  id: r.id,
  title: r.title,
  venue: r.venue,
  matchDate: r.match_date,
  format: r.format,
  status: r.status,
  result: r.result,
  summary: JSON.parse(r.summary_json),
  ownerName: r.owner_name,
  updatedAt: toIso(r.updated_at),
  version: r.version,
});

/** Full row -> API match record (with state). */
const toRecord = (r) => ({
  id: r.id,
  version: r.version,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  status: r.status,
  title: r.title,
  venue: r.venue,
  matchDate: r.match_date,
  format: r.format,
  result: r.result,
  summary: JSON.parse(r.summary_json),
  updatedAt: toIso(r.updated_at),
  state: JSON.parse(r.state_json),
});

/** Columns derived on the server from the state, never from separate client fields. */
const deriveColumns = (state) => ({
  title: state.setup.title,
  venue: state.setup.venue,
  match_date: state.setup.date,
  format: state.setup.format,
  status: state.phase === 'finished' ? 'finished' : 'live',
  result: state.result || null,
  state_json: JSON.stringify(state),
});

function createMatchService({ matches }) {
  async function newMatchId() {
    for (let i = 0; i < 10; i++) {
      const id = crypto.randomBytes(6).toString('base64url'); // 8 characters
      if (!(await matches.exists(id))) return id;
    }
    throw new Error('Could not create a match id');
  }

  return {
    async listPublic() {
      return (await matches.listPublic()).map(toListItem);
    },

    async listMine(ownerId) {
      return (await matches.listByOwner(ownerId)).map(toListItem);
    },

    getRow: (id) => matches.findById(id),

    async getRecord(id) {
      const row = await matches.findById(id);
      return row ? toRecord(row) : null;
    },

    async create(ownerId, state, summary) {
      const id = await newMatchId();
      await matches.insert({ id, owner_id: ownerId, ...deriveColumns(state), summary_json: JSON.stringify(summary) });
      return { id, version: 1 };
    },

    /** Returns true if saved, false if the version was stale. */
    update: (id, version, state, summary) =>
      matches.update({ id, version, ...deriveColumns(state), summary_json: JSON.stringify(summary) }),

    remove: (id) => matches.remove(id),
  };
}

module.exports = { createMatchService };
