'use strict';

const { fail } = require('../utils/http');
const { readCredentials, isValidUsername, isValidPassword } = require('../validators/auth.validator');

function createAuthController({ authService, allowRegistration }) {
  return {
    config(req, res) {
      res.json({ allowRegistration: !!allowRegistration });
    },

    async register(req, res) {
      if (!allowRegistration) return fail(res, 403, 'New accounts are turned off');
      const c = readCredentials(req.body);
      if (!c) return fail(res, 400, 'Enter a username and a password');
      if (!isValidUsername(c.username)) {
        return fail(res, 400, 'Username must be 3 to 30 characters: letters, numbers, dot, dash or underscore');
      }
      if (!isValidPassword(c.password)) return fail(res, 400, 'Password must be 8 to 200 characters');
      const result = await authService.register(c.username, c.password);
      if (!result) return fail(res, 409, 'That username is taken');
      res.status(201).json(result);
    },

    async login(req, res) {
      const c = readCredentials(req.body);
      if (!c) return fail(res, 400, 'Enter a username and a password');
      const result = await authService.login(c.username, c.password, { validUsername: isValidUsername(c.username) });
      if (!result) return fail(res, 401, 'Wrong username or password');
      res.json(result);
    },

    me(req, res) {
      res.json({ user: { id: req.user.id, username: req.user.username } });
    },
  };
}

module.exports = { createAuthController };
