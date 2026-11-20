'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/http');

/** /api/matches/* */
function matchRoutes({ controller, requireAuth }) {
  const router = express.Router();
  router.get('/', asyncHandler(controller.list));
  router.post('/', requireAuth, asyncHandler(controller.create));
  router.get('/:id', asyncHandler(controller.get));
  router.put('/:id', requireAuth, asyncHandler(controller.update));
  router.delete('/:id', requireAuth, asyncHandler(controller.remove));
  router.get('/:id/stream', asyncHandler(controller.stream));
  return router;
}

module.exports = { matchRoutes };
