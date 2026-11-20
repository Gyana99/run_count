'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { openPool } = require('./db/pool');
const { createUserRepository } = require('./repositories/user.repository');
const { createMatchRepository } = require('./repositories/match.repository');
const { createAuthService } = require('./services/auth.service');
const { createMatchService } = require('./services/match.service');
const { createStreamService } = require('./services/stream.service');
const { createAuthController } = require('./controllers/auth.controller');
const { createMatchController } = require('./controllers/match.controller');
const { createAuthMiddleware } = require('./middleware/auth.middleware');
const { createAuthLimiter } = require('./middleware/rate-limit.middleware');
const { securityHeaders } = require('./middleware/security.middleware');
const { createCors } = require('./middleware/cors.middleware');
const { errorHandler } = require('./middleware/error.middleware');
const { apiRouter } = require('./routes');

/**
 * Builds the Express app.
 * @param {object} opts
 * @param {object} [opts.pool]    an existing mysql2 pool (the app will not close it)
 * @param {object} [opts.db]      MySQL settings, used to open a pool when none is given
 * @param {object} [opts.dbOptions] passed to openPool (createDatabase, migrate, reset)
 * @param {string} opts.jwtSecret
 * @param {string[]} [opts.corsOrigins] browser origins allowed to call the API (the Angular app)
 * @returns {Promise<{ app, pool, close: () => Promise<void> }>}
 */
async function createApp({
  pool,
  db,
  dbOptions,
  jwtSecret,
  jwtExpiresIn = '7d',
  allowRegistration = true,
  staticDir = null,
  rateLimitMax = 20,
  corsOrigins = [],
}) {
  if (!pool && !db) throw new Error('createApp needs a pool or db settings');
  if (!jwtSecret) throw new Error('createApp needs a jwtSecret');

  const ownsPool = !pool;
  const dbPool = pool || (await openPool(db, dbOptions));

  // Data -> services -> controllers
  const users = createUserRepository(dbPool);
  const matches = createMatchRepository(dbPool);
  const authService = createAuthService({ users, jwtSecret, jwtExpiresIn });
  const matchService = createMatchService({ matches });
  const streamService = createStreamService();
  const authController = createAuthController({ authService, allowRegistration });
  const matchController = createMatchController({ matchService, streamService, authService });

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use('/api', createCors(corsOrigins));
  app.use(express.json({ limit: '2mb' }));

  app.use(
    '/api',
    apiRouter({
      authController,
      matchController,
      requireAuth: createAuthMiddleware(authService),
      authLimiter: createAuthLimiter(rateLimitMax),
    }),
  );

  // The built Angular app (production)
  if (staticDir) {
    app.use(express.static(staticDir));
    const indexFile = path.join(staticDir, 'index.html');
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api')) return next();
      if (!fs.existsSync(indexFile)) return next();
      res.sendFile(indexFile);
    });
  }

  app.use(errorHandler);

  async function close() {
    streamService.closeAll();
    if (ownsPool) await dbPool.end();
  }

  return { app, pool: dbPool, close };
}

module.exports = { createApp };
