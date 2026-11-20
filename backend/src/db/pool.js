'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const DB_NAME_RE = /^[A-Za-z0-9_]{1,64}$/;

/** Creates the database itself if it does not exist yet. */
async function ensureDatabase(cfg) {
  if (!DB_NAME_RE.test(cfg.database)) throw new Error(`Invalid database name: ${cfg.database}`);
  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await conn.end();
  }
}

/** Runs schema.sql (CREATE TABLE IF NOT EXISTS ...). */
async function applySchema(pool) {
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const statement of statements) await pool.query(statement);
}

/** Drops all tables. Only used by the tests. */
async function dropSchema(pool) {
  await pool.query('DROP TABLE IF EXISTS matches');
  await pool.query('DROP TABLE IF EXISTS users');
}

/**
 * Opens a connection pool. All times are stored and read as UTC.
 * @param {object} cfg settings from config/env.js dbConfig()
 * @param {{ createDatabase?: boolean, migrate?: boolean, reset?: boolean }} [opts]
 */
async function openPool(cfg, { createDatabase = true, migrate = true, reset = false } = {}) {
  if (createDatabase) await ensureDatabase(cfg);
  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: cfg.connectionLimit || 10,
    waitForConnections: true,
    timezone: 'Z',
    charset: 'utf8mb4',
    namedPlaceholders: true,
  });
  pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
  if (reset) await dropSchema(pool);
  if (migrate) await applySchema(pool);
  return pool;
}

module.exports = { openPool, applySchema, dropSchema, ensureDatabase };
