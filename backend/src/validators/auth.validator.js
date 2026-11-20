'use strict';

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;

/** Returns { username, password } or null if either is missing or not a string. */
function readCredentials(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  return { username: username.trim(), password };
}

const isValidUsername = (u) => USERNAME_RE.test(u);
const isValidPassword = (p) => p.length >= 8 && p.length <= 200;

module.exports = { readCredentials, isValidUsername, isValidPassword };
