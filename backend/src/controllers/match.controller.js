'use strict';

const { fail } = require('../utils/http');
const { validateState, sanitizeSummary } = require('../validators/match.validator');

function createMatchController({ matchService, streamService, authService }) {
  return {
    /** GET /api/matches?scope=public|mine */
    async list(req, res) {
      const scope = req.query.scope === undefined ? 'public' : req.query.scope;
      if (scope === 'mine') {
        const user = await authService.userFromHeader(req.headers.authorization);
        if (!user) return fail(res, 401, 'Log in to continue');
        return res.json({ matches: await matchService.listMine(user.id) });
      }
      if (scope !== 'public') return fail(res, 400, 'Invalid request');
      res.json({ matches: await matchService.listPublic() });
    },

    /** POST /api/matches */
    async create(req, res) {
      const { state, summary } = req.body || {};
      const clean = sanitizeSummary(summary);
      if (!validateState(state) || !clean) return fail(res, 400, 'Invalid match data');
      res.status(201).json(await matchService.create(req.user.id, state, clean));
    },

    /** GET /api/matches/:id */
    async get(req, res) {
      const record = await matchService.getRecord(req.params.id);
      if (!record) return fail(res, 404, 'Match not found');
      res.json(record);
    },

    /** PUT /api/matches/:id  (owner only, optimistic version check) */
    async update(req, res) {
      const row = await matchService.getRow(req.params.id);
      if (!row) return fail(res, 404, 'Match not found');
      if (row.owner_id !== req.user.id) return fail(res, 403, 'Only the scorer who started this match can change it');
      const { state, summary, version } = req.body || {};
      const clean = sanitizeSummary(summary);
      if (!Number.isInteger(version)) return fail(res, 400, 'Invalid request');
      if (!validateState(state) || !clean) return fail(res, 400, 'Invalid match data');

      const conflict = (current) =>
        fail(res, 409, 'This match was changed somewhere else. Reload to continue.', { version: current });
      if (version !== row.version) return conflict(row.version);

      const saved = await matchService.update(row.id, version, state, clean);
      if (!saved) {
        const now = await matchService.getRow(row.id);
        return conflict(now ? now.version : row.version);
      }
      const record = await matchService.getRecord(row.id);
      res.json({ version: record.version, updatedAt: record.updatedAt });
      streamService.publish(record);
    },

    /** DELETE /api/matches/:id  (owner only) */
    async remove(req, res) {
      const row = await matchService.getRow(req.params.id);
      if (!row) return fail(res, 404, 'Match not found');
      if (row.owner_id !== req.user.id) return fail(res, 403, 'Only the scorer who started this match can delete it');
      await matchService.remove(row.id);
      streamService.closeMatch(row.id);
      res.status(204).end();
    },

    /** GET /api/matches/:id/stream  (server-sent events) */
    async stream(req, res) {
      const record = await matchService.getRecord(req.params.id);
      if (!record) return fail(res, 404, 'Match not found');
      streamService.subscribe(req, res, record);
    },
  };
}

module.exports = { createMatchController };
