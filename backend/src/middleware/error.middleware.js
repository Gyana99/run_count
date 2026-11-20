'use strict';

const { fail, HttpError } = require('../utils/http');

/** JSON 404 for unknown /api paths. */
const apiNotFound = (req, res) => fail(res, 404, 'Not found');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return fail(res, err.status, err.message, err.extra);
  if (err && err.type === 'entity.parse.failed') return fail(res, 400, 'Invalid request');
  if (err && err.type === 'entity.too.large') return fail(res, 413, 'Match data is too large');
  console.error('Unexpected error:', err && err.message);
  if (res.headersSent) return res.end();
  fail(res, 500, 'Something went wrong. Try again.');
}

module.exports = { apiNotFound, errorHandler };
