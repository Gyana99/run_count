'use strict';

const express = require('express');
const { authRoutes } = require('./auth.routes');
const { matchRoutes } = require('./match.routes');
const { apiNotFound } = require('../middleware/error.middleware');

/** Everything under /api */
function apiRouter({ authController, matchController, requireAuth, authLimiter }) {
  const router = express.Router();
  router.get('/config', authController.config);
  router.use('/auth', authRoutes({ controller: authController, requireAuth, authLimiter }));
  router.use('/matches', matchRoutes({ controller: matchController, requireAuth }));
  router.use(apiNotFound);
  return router;
}

module.exports = { apiRouter };
