'use strict';

const env = require('./config/env');
const { createApp } = require('./app');

async function main() {
  const db = env.dbConfig();
  const staticDir = env.findStaticDir();
  const { app, close } = await createApp({
    db,
    jwtSecret: env.loadJwtSecret(),
    jwtExpiresIn: env.jwtExpiresIn,
    allowRegistration: env.allowRegistration,
    staticDir,
    corsOrigins: env.corsOrigins,
  });

  const server = app.listen(env.port, () => {
    console.log(`Run Count API listening on http://localhost:${env.port}`);
    console.log(`Database: mysql://${db.user}@${db.host}:${db.port}/${db.database}`);
    console.log(staticDir ? `Serving the app from ${staticDir}` : 'No built app found (run "ng build", or use "ng serve" with the proxy).');
    console.log(`Allowed app origins (CORS): ${env.corsOrigins.join(', ') || 'none'}`);
    if (!env.allowRegistration) console.log('New accounts are turned off (ALLOW_REGISTRATION=false).');
  });

  const shutdown = () => {
    server.close(() => close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error('Could not start the server:', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER / DB_PASSWORD in backend/.env');
  if (e.code === 'ECONNREFUSED') console.error('Is MySQL running? Check DB_HOST / DB_PORT in backend/.env');
  process.exit(1);
});
