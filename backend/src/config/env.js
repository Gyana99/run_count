'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');

const int = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : fallback;
};

/** MySQL settings from the environment. */
function dbConfig(overrides = {}) {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'runcount',
    connectionLimit: int(process.env.DB_CONNECTION_LIMIT, 10),
    ...overrides,
  };
}

/** Uses JWT_SECRET, or creates and keeps a random secret in data/.jwt-secret. */
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

/** The built Angular app, if "ng build" has been run. */
function findStaticDir() {
  const built = path.join(ROOT, '..', 'frontend', 'dist', 'run-count-view', 'browser');
  return fs.existsSync(path.join(built, 'index.html')) ? built : null;
}

module.exports = {
  dbConfig,
  loadJwtSecret,
  findStaticDir,
  port: int(process.env.PORT, 3000),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
  /** Browser origins allowed to call the API, comma-separated. */
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
