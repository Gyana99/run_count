'use strict';

const { fail } = require('../utils/http');

/** requireAuth: 401 unless a valid token is sent. Sets req.user. */
function createAuthMiddleware(authService) {
  return async function requireAuth(req, res, next) {
    try {
      const user = await authService.userFromHeader(req.headers.authorization);
      if (!user) return fail(res, 401, 'Log in to continue');
      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { createAuthMiddleware };
