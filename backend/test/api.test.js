'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { dbConfig } = require('../src/config/env');

// Tests run against their own MySQL database, which is wiped at the start.
const testDb = dbConfig({ database: process.env.TEST_DB_NAME || 'runcount_test' });

let server;
let base;
let handle;

const players = (t) => Array.from({ length: 3 }, (_, i) => ({ id: `${t}-${i}`, name: `T${t}P${i + 1}` }));

function makeState(overrides = {}) {
  return {
    setup: {
      title: 'Final',
      venue: 'Wankhede',
      date: '2026-11-20',
      format: 'T20',
      oversPerInnings: 20,
      teams: [
        { name: 'India', players: players(0) },
        { name: 'Australia', players: players(1) },
      ],
    },
    innings: [{ index: 0, deliveries: [] }],
    phase: 'live',
    result: null,
    ...overrides,
  };
}

const makeSummary = (runs = 0) => ({
  scores: [{ team: 'India', label: '1st innings', runs, wickets: 0, overs: '0.0', current: true }],
});

async function api(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, json };
}

async function register(username, password = 'password123') {
  const r = await api('POST', '/api/auth/register', { body: { username, password } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

async function createMatch(token, state = makeState(), summary = makeSummary()) {
  const r = await api('POST', '/api/matches', { token, body: { state, summary } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json;
}

before(async () => {
  handle = await createApp({ db: testDb, dbOptions: { reset: true }, jwtSecret: 'test-secret', rateLimitMax: 10000 });
  await new Promise((resolve) => {
    server = handle.app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await handle.close();
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections?.();
});

describe('accounts', () => {
  test('config reports whether registration is open', async () => {
    const r = await api('GET', '/api/config');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { allowRegistration: true });
  });

  test('register, log in and read /me', async () => {
    const reg = await register('scorer_one');
    assert.ok(reg.token);
    assert.equal(reg.user.username, 'scorer_one');
    assert.equal(typeof reg.user.id, 'number');

    const login = await api('POST', '/api/auth/login', { body: { username: 'scorer_one', password: 'password123' } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.id, reg.user.id);

    const me = await api('GET', '/api/auth/me', { token: login.json.token });
    assert.equal(me.status, 200);
    assert.deepEqual(me.json, { user: { id: reg.user.id, username: 'scorer_one' } });
  });

  test('a taken username (any letter case) returns 409', async () => {
    await register('dupe_user');
    const r = await api('POST', '/api/auth/register', { body: { username: 'DUPE_USER', password: 'password123' } });
    assert.equal(r.status, 409);
    assert.ok(r.json.error);
  });

  test('wrong password and unknown user both return the same 401', async () => {
    await register('login_user');
    const wrong = await api('POST', '/api/auth/login', { body: { username: 'login_user', password: 'not-the-one' } });
    const unknown = await api('POST', '/api/auth/login', { body: { username: 'nobody_here', password: 'password123' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error, 'Wrong username or password');
    assert.deepEqual(unknown.json, wrong.json);
  });

  test('validation: short username, bad characters, short password, wrong types', async () => {
    const bad = [
      { username: 'ab', password: 'password123' },
      { username: 'has space', password: 'password123' },
      { username: 'x'.repeat(31), password: 'password123' },
      { username: 'okname', password: 'short' },
      { username: 'okname', password: 'p'.repeat(201) },
      { username: 123, password: 'password123' },
      {},
    ];
    for (const body of bad) {
      const r = await api('POST', '/api/auth/register', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.json.error);
    }
  });

  test('requests without a valid token get 401', async () => {
    assert.equal((await api('GET', '/api/auth/me')).status, 401);
    assert.equal((await api('GET', '/api/auth/me', { token: 'garbage' })).status, 401);
  });

  test('a long password is not cut off at 72 bytes', async () => {
    const long = 'a'.repeat(80);
    await api('POST', '/api/auth/register', { body: { username: 'long_pw', password: long + 'X' } });
    const ok = await api('POST', '/api/auth/login', { body: { username: 'long_pw', password: long + 'X' } });
    const differs = await api('POST', '/api/auth/login', { body: { username: 'long_pw', password: long + 'Y' } });
    assert.equal(ok.status, 200);
    assert.equal(differs.status, 401);
  });

  test('registration can be turned off (403)', async () => {
    const closed = await createApp({ pool: handle.pool, jwtSecret: 's', allowRegistration: false, rateLimitMax: 100 });
    const srv = await new Promise((resolve) => {
      const s = closed.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const url = `http://127.0.0.1:${srv.address().port}`;
      const cfg = await (await fetch(`${url}/api/config`)).json();
      assert.deepEqual(cfg, { allowRegistration: false });
      const res = await fetch(`${url}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'someone', password: 'password123' }),
      });
      assert.equal(res.status, 403);
      assert.ok((await res.json()).error);
    } finally {
      await closed.close();
      srv.closeAllConnections?.();
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  test('login and register are rate limited', async () => {
    const limited = await createApp({ pool: handle.pool, jwtSecret: 's', rateLimitMax: 2 });
    const srv = await new Promise((resolve) => {
      const s = limited.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const url = `http://127.0.0.1:${srv.address().port}`;
      const attempt = () =>
        fetch(`${url}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'nobody', password: 'password123' }),
        });
      assert.equal((await attempt()).status, 401);
      assert.equal((await attempt()).status, 401);
      const third = await attempt();
      assert.equal(third.status, 429);
      assert.ok((await third.json()).error);
    } finally {
      await limited.close();
      srv.closeAllConnections?.();
      await new Promise((resolve) => srv.close(resolve));
    }
  });
});

describe('matches', () => {
  test('create, then read publicly without a token', async () => {
    const { token } = await register('owner_a');
    const created = await createMatch(token);
    assert.equal(created.id.length, 8);
    assert.match(created.id, /^[A-Za-z0-9_-]{8}$/);
    assert.equal(created.version, 1);

    const got = await api('GET', `/api/matches/${created.id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.id, created.id);
    assert.equal(got.json.version, 1);
    assert.equal(got.json.ownerName, 'owner_a');
    assert.equal(got.json.title, 'Final');
    assert.equal(got.json.venue, 'Wankhede');
    assert.equal(got.json.matchDate, '2026-11-20');
    assert.equal(got.json.format, 'T20');
    assert.equal(got.json.status, 'live');
    assert.equal(got.json.result, null);
    assert.deepEqual(got.json.summary, makeSummary());
    assert.deepEqual(got.json.state, makeState());
    assert.ok(!Number.isNaN(Date.parse(got.json.updatedAt)));
  });

  test('missing match returns 404', async () => {
    const r = await api('GET', '/api/matches/nope1234');
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'Match not found');
  });

  test('public list has no state, puts live matches first, and scope=mine filters', async () => {
    const a = await register('list_owner_a');
    const b = await register('list_owner_b');
    const finished = await createMatch(a.token, makeState({ phase: 'finished', result: 'India won by 5 runs' }));
    const live = await createMatch(b.token);

    const list = await api('GET', '/api/matches');
    assert.equal(list.status, 200);
    const ids = list.json.matches.map((m) => m.id);
    assert.ok(ids.includes(finished.id) && ids.includes(live.id));
    assert.ok(ids.indexOf(live.id) < ids.indexOf(finished.id), 'live first');
    for (const m of list.json.matches) {
      assert.equal(m.state, undefined);
      assert.ok(m.title && m.ownerName && m.updatedAt && m.summary && typeof m.version === 'number');
    }
    const fin = list.json.matches.find((m) => m.id === finished.id);
    assert.equal(fin.status, 'finished');
    assert.equal(fin.result, 'India won by 5 runs');

    const mineA = await api('GET', '/api/matches?scope=mine', { token: a.token });
    assert.equal(mineA.status, 200);
    assert.deepEqual(mineA.json.matches.map((m) => m.id), [finished.id]);

    assert.equal((await api('GET', '/api/matches?scope=mine')).status, 401);
    assert.equal((await api('GET', '/api/matches?scope=bogus')).status, 400);
  });

  test('creating needs a login and valid data', async () => {
    const { token } = await register('owner_b');
    assert.equal((await api('POST', '/api/matches', { body: { state: makeState(), summary: makeSummary() } })).status, 401);

    const bad = [
      { state: null, summary: makeSummary() },
      { state: makeState({ phase: 'paused' }), summary: makeSummary() },
      { state: makeState({ innings: 'x' }), summary: makeSummary() },
      { state: makeState({ innings: [{ deliveries: 'x' }] }), summary: makeSummary() },
      { state: { ...makeState(), setup: { ...makeState().setup, teams: [makeState().setup.teams[0]] } }, summary: makeSummary() },
      { state: makeState(), summary: { scores: [{ team: 'x' }] } },
      { state: makeState(), summary: null },
      { state: makeState() },
    ];
    for (const body of bad) {
      const r = await api('POST', '/api/matches', { token, body });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
      assert.ok(r.json.error);
    }
    assert.equal((await api('POST', '/api/matches', { token, raw: '{not json', body: undefined })).status, 400);
  });

  test('summary is sanitised: extra fields are dropped', async () => {
    const { token } = await register('owner_c');
    const summary = {
      scores: [{ team: 'India', label: '1st innings', runs: 5, wickets: 1, overs: '1.2', current: true, evil: '<script>' }],
      other: 1,
    };
    const { id } = await createMatch(token, makeState(), summary);
    const got = await api('GET', `/api/matches/${id}`);
    assert.deepEqual(got.json.summary, {
      scores: [{ team: 'India', label: '1st innings', runs: 5, wickets: 1, overs: '1.2', current: true }],
    });
  });

  test('only the owner can update; version goes up; columns follow the state', async () => {
    const owner = await register('owner_d');
    const other = await register('other_d');
    const { id } = await createMatch(owner.token);
    const next = makeState({ phase: 'finished', result: 'India won by 3 wickets' });

    const noToken = await api('PUT', `/api/matches/${id}`, { body: { state: next, summary: makeSummary(9), version: 1 } });
    assert.equal(noToken.status, 401);

    const notOwner = await api('PUT', `/api/matches/${id}`, {
      token: other.token,
      body: { state: next, summary: makeSummary(9), version: 1 },
    });
    assert.equal(notOwner.status, 403);

    const ok = await api('PUT', `/api/matches/${id}`, {
      token: owner.token,
      body: { state: next, summary: makeSummary(9), version: 1 },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.version, 2);
    assert.ok(ok.json.updatedAt);

    const got = await api('GET', `/api/matches/${id}`);
    assert.equal(got.json.version, 2);
    assert.equal(got.json.status, 'finished');
    assert.equal(got.json.result, 'India won by 3 wickets');
    assert.equal(got.json.summary.scores[0].runs, 9);

    const missing = await api('PUT', '/api/matches/nope1234', {
      token: owner.token,
      body: { state: next, summary: makeSummary(), version: 1 },
    });
    assert.equal(missing.status, 404);

    const badBody = await api('PUT', `/api/matches/${id}`, {
      token: owner.token,
      body: { state: { nope: true }, summary: makeSummary(), version: 2 },
    });
    assert.equal(badBody.status, 400);
    const noVersion = await api('PUT', `/api/matches/${id}`, {
      token: owner.token,
      body: { state: next, summary: makeSummary() },
    });
    assert.equal(noVersion.status, 400);
  });

  test('a stale version returns 409 with the current version', async () => {
    const owner = await register('owner_e');
    const { id } = await createMatch(owner.token);
    const put = (version, runs) =>
      api('PUT', `/api/matches/${id}`, { token: owner.token, body: { state: makeState(), summary: makeSummary(runs), version } });

    assert.equal((await put(1, 1)).status, 200); // now version 2
    assert.equal((await put(2, 2)).status, 200); // now version 3
    const stale = await put(1, 99);
    assert.equal(stale.status, 409);
    assert.equal(stale.json.version, 3);
    assert.ok(stale.json.error);
    const got = await api('GET', `/api/matches/${id}`);
    assert.equal(got.json.summary.scores[0].runs, 2, 'stale write must not be saved');
  });

  test('only the owner can delete', async () => {
    const owner = await register('owner_f');
    const other = await register('other_f');
    const { id } = await createMatch(owner.token);

    assert.equal((await api('DELETE', `/api/matches/${id}`)).status, 401);
    assert.equal((await api('DELETE', `/api/matches/${id}`, { token: other.token })).status, 403);
    assert.equal((await api('DELETE', `/api/matches/${id}`, { token: owner.token })).status, 204);
    assert.equal((await api('GET', `/api/matches/${id}`)).status, 404);
    assert.equal((await api('DELETE', `/api/matches/${id}`, { token: owner.token })).status, 404);
  });

  test('oversized bodies return 413 and unknown API paths return JSON 404', async () => {
    const { token } = await register('owner_g');
    const huge = await api('POST', '/api/matches', { token, raw: JSON.stringify({ pad: 'x'.repeat(2.2 * 1024 * 1024) }), body: {} });
    assert.equal(huge.status, 413);
    const unknown = await api('GET', '/api/nothing-here');
    assert.equal(unknown.status, 404);
    assert.ok(unknown.json.error);
  });
});

/** Reads server-sent events from a fetch response body. */
function eventReader(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    async next(timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const ev = { event: 'message', data: '' };
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            else if (line.startsWith('data: ')) ev.data += line.slice(6);
            else if (line.startsWith('retry: ')) ev.retry = Number(line.slice(7));
          }
          if (ev.data === '' && ev.retry === undefined) continue; // comment only
          if (ev.data === '') continue; // retry hint
          return { ...ev, json: JSON.parse(ev.data) };
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error('Timed out waiting for an event');
        const chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out waiting for an event')), left)),
        ]);
        if (chunk.done) throw new Error('Stream ended');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    cancel: () => reader.cancel().catch(() => {}),
  };
}

describe('live stream', () => {
  test('sends the current state first, then every update', async () => {
    const owner = await register('stream_owner');
    const { id } = await createMatch(owner.token);

    const ac = new AbortController();
    const res = await fetch(`${base}/api/matches/${id}/stream`, { signal: ac.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    assert.match(res.headers.get('cache-control'), /no-cache/);
    assert.equal(res.headers.get('x-accel-buffering'), 'no');

    const events = eventReader(res);
    try {
      const first = await events.next();
      assert.equal(first.event, 'state');
      assert.equal(first.json.id, id);
      assert.equal(first.json.version, 1);
      assert.equal(first.json.state.setup.title, 'Final');

      const put = await api('PUT', `/api/matches/${id}`, {
        token: owner.token,
        body: { state: makeState({ phase: 'finished', result: 'Tied' }), summary: makeSummary(7), version: 1 },
      });
      assert.equal(put.status, 200);

      const second = await events.next();
      assert.equal(second.event, 'state');
      assert.equal(second.json.version, 2);
      assert.equal(second.json.status, 'finished');
      assert.equal(second.json.result, 'Tied');
      assert.equal(second.json.summary.scores[0].runs, 7);
    } finally {
      await events.cancel();
      ac.abort();
    }
  });

  test('unknown match stream returns 404', async () => {
    const r = await api('GET', '/api/matches/nope1234/stream');
    assert.equal(r.status, 404);
  });
});
