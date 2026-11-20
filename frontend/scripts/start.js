'use strict';

/**
 * `npm start` in frontend/:
 *   1. starts the Express API from ../backend (unless it is already running on its port),
 *   2. starts the Angular dev server (ng serve),
 *   3. stops the API again when you stop this with Ctrl+C.
 * The Angular app then calls the API at environment.apiUrl (http://localhost:3000/api).
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const BACKEND_DIR = path.resolve(__dirname, '..', '..', 'backend');
const FRONTEND_DIR = path.resolve(__dirname, '..');
const API_PORT = Number.parseInt(process.env.API_PORT, 10) || 3000;
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const children = [];

/** Prints a child's output with a coloured [api] / [web] prefix. */
function pipe(stream, label, color) {
  let rest = '';
  stream.on('data', (chunk) => {
    const lines = (rest + chunk.toString()).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) console.log(`\x1b[${color}m[${label}]\x1b[0m ${line}`);
  });
  stream.on('end', () => rest && console.log(`\x1b[${color}m[${label}]\x1b[0m ${rest}`));
}

function run(label, color, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell: isWin, env: { ...process.env, FORCE_COLOR: '1' } });
  pipe(child.stdout, label, color);
  pipe(child.stderr, label, color);
  children.push(child);
  return child;
}

/** True if something is already listening on the API port. */
const portInUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
  });

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}

async function main() {
  if (!fs.existsSync(BACKEND_DIR)) {
    console.error(`Backend folder not found: ${BACKEND_DIR}`);
    process.exit(1);
  }

  if (await portInUse(API_PORT)) {
    console.log(`\x1b[33m[api]\x1b[0m Already running on port ${API_PORT}, not starting another one.`);
  } else {
    if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
      console.log('\x1b[33m[api]\x1b[0m Installing backend packages (first run)...');
      const install = spawnSync(npm, ['install'], { cwd: BACKEND_DIR, stdio: 'inherit', shell: isWin });
      if (install.status !== 0) process.exit(install.status || 1);
    }
    const api = run('api', 33, npm, ['start'], BACKEND_DIR);
    api.on('exit', (code) => {
      if (code) console.log(`\x1b[33m[api]\x1b[0m Backend stopped (exit ${code}). Fix the error above, then run npm start again.`);
    });
  }

  const web = run('web', 36, npm, ['run', 'start:web', '--', ...process.argv.slice(2)], FRONTEND_DIR);
  web.on('exit', (code) => {
    stopAll();
    process.exit(code || 0);
  });
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    stopAll();
    process.exit(0);
  });
}
process.on('exit', stopAll);

main();
