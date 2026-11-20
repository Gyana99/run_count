'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/http');

/** /api/auth/* */
function authRoutes({ controller, requireAuth, authLimiter }) {
  const router = express.Router();
  router.post('/register', authLimiter, asyncHandler(controller.register));
  router.post('/login', authLimiter, asyncHandler(controller.login));
  router.get('/me', requireAuth, controller.me);
  return router;
}

module.exports = { authRoutes };
