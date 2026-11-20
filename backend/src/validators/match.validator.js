'use strict';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max, min = 0) => typeof v === 'string' && v.length >= min && v.length <= max;

/** Checks the shape of a full match state sent by the scorer. */
function validateState(state) {
  if (!isObj(state)) return false;
  const s = state.setup;
  if (!isObj(s)) return false;
  if (!isStr(s.title, 200) || !isStr(s.venue, 200) || !isStr(s.date, 40, 1) || !isStr(s.format, 40, 1)) return false;
  if (!Array.isArray(s.teams) || s.teams.length !== 2) return false;
  for (const t of s.teams) {
    if (!isObj(t) || !isStr(t.name, 100) || !Array.isArray(t.players) || t.players.length > 20) return false;
    for (const p of t.players) {
      if (!isObj(p) || !isStr(p.id, 50) || !isStr(p.name, 100)) return false;
    }
  }
  if (!Array.isArray(state.innings) || state.innings.length > 40) return false;
  for (const inn of state.innings) {
    if (!isObj(inn) || !Array.isArray(inn.deliveries) || inn.deliveries.length > 5000) return false;
  }
  if (state.phase !== 'live' && state.phase !== 'finished') return false;
  if (state.result !== undefined && state.result !== null && !isStr(state.result, 300)) return false;
  return true;
}

/** Returns a clean summary with only known fields, or null if the shape is wrong. */
function sanitizeSummary(summary) {
  if (!isObj(summary) || !Array.isArray(summary.scores) || summary.scores.length > 40) return null;
  const scores = [];
  for (const e of summary.scores) {
    if (!isObj(e)) return null;
    if (!isStr(e.team, 100) || !isStr(e.label, 40) || !isStr(e.overs, 10)) return null;
    if (!Number.isInteger(e.runs) || !Number.isInteger(e.wickets) || typeof e.current !== 'boolean') return null;
    scores.push({ team: e.team, label: e.label, runs: e.runs, wickets: e.wickets, overs: e.overs, current: e.current });
  }
  return { scores };
}

module.exports = { validateState, sanitizeSummary };
