'use strict';

/**
 * Lets the Angular app call the API from another origin (e.g. http://localhost:4200 in development).
 * Only origins in the list are allowed. Logins use a bearer token, not cookies, so no credentials are needed.
 * @param {string[]} allowedOrigins exact origins, e.g. ['http://localhost:4200', 'https://scores.example.com']
 */
function createCors(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return function cors(req, res, next) {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

module.exports = { createCors };
