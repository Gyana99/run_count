'use strict';

/** Creates the database and tables: npm run db:migrate */
const { dbConfig } = require('../config/env');
const { openPool } = require('./pool');

(async () => {
  const cfg = dbConfig();
  const pool = await openPool(cfg);
  await pool.end();
  console.log(`Schema is up to date in ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
})().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
