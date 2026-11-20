'use strict';

const rateLimit = require('express-rate-limit');
const { fail } = require('../utils/http');

/** Limits login and register attempts per IP. */
const createAuthLimiter = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (req, res) => fail(res, 429, 'Too many attempts. Try again in a few minutes.'),
  });

module.exports = { createAuthLimiter };
