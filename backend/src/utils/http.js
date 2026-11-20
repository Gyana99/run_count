'use strict';

/** Sends a JSON error: { error, ...extra }. */
const fail = (res, status, error, extra) => res.status(status).json({ error, ...extra });

/** Error with an HTTP status, turned into a JSON response by the error handler. */
class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Wraps an async route handler so rejected promises reach the error handler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { fail, HttpError, asyncHandler };
