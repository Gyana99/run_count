import {
  BallInput,
  BatterLine,
  BowlerLine,
  Delivery,
  DismissalType,
  ExtraType,
  FowLine,
  Innings,
  InningsSummary,
  MatchSetup,
  MatchState,
  RunsSource,
  TeamIdx,
} from './models';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export const other = (t: TeamIdx): TeamIdx => (t === 0 ? 1 : 0);
export const isLimited = (setup: MatchSetup): boolean => setup.format !== 'TEST';
export const oversText = (balls: number): string => `${Math.floor(balls / 6)}.${balls % 6}`;

/** Dismissals that credit the bowler. */
const BOWLER_CREDIT: DismissalType[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket'];
/** Dismissals where the striker is always the batter who is out. */
export const STRIKER_ONLY: DismissalType[] = ['bowled', 'caught', 'lbw', 'stumped', 'hit wicket'];

export function current(s: MatchState): Innings | undefined {
  return s.innings[s.innings.length - 1];
}

export function playerName(s: MatchState, id: string | null | undefined): string {
  if (!id) return '';
  for (const t of s.setup.teams) {
    const p = t.players.find((x) => x.id === id);
    if (p) return p.name;
  }
  return '';
}

export function legalBalls(inn: Innings): number {
  let n = 0;
  for (const d of inn.deliveries) if (d.kind === 'ball' && d.legal) n++;
  return n;
}

export const runsOf = (inn: Innings): number => inn.deliveries.reduce((a, d) => a + d.totalRuns, 0);

export const countsAsWicket = (d: Delivery): boolean => !!d.wicket && d.wicket.type !== 'retired hurt';

export const wicketsOf = (inn: Innings): number => inn.deliveries.filter(countsAsWicket).length;

function teamRuns(s: MatchState, team: TeamIdx): number {
  return s.innings.filter((i) => i.battingTeam === team).reduce((a, i) => a + runsOf(i), 0);
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ */
/* ICC rule helpers                                                    */
/* ------------------------------------------------------------------ */

/** ICC: first-innings lead needed before the follow-on can be enforced. */
export function followOnThreshold(setup: MatchSetup): number {
  if (setup.days >= 5) return 200;
  if (setup.days >= 3) return 150;
  if (setup.days === 2) return 100;
  return 75;
}

/** ICC: a bowler may bowl at most one-fifth of the innings (rounded up). Tests: unlimited. */
export function maxOversPerBowler(s: MatchState, inn: Innings): number | null {
  if (!isLimited(s.setup)) return null;
  if (inn.kind === 'super') return 1;
  if (inn.oversLimit === null) return null;
  return Math.ceil(inn.oversLimit / 5);
}

export function bowlerBalls(inn: Innings, id: string): number {
  let n = 0;
  for (const d of inn.deliveries) if (d.kind === 'ball' && d.legal && d.bowler === id) n++;
  return n;
}

/** The ball after a no-ball (limited overs) is a free hit. Wides do not use up a free hit. */
export function freeHitActive(s: MatchState, inn: Innings): boolean {
  if (!isLimited(s.setup)) return false;
  for (let i = inn.deliveries.length - 1; i >= 0; i--) {
    const d = inn.deliveries[i];
    if (d.kind !== 'ball' || d.extra === 'wide') continue;
    return d.extra === 'noball';
  }
  return false;
}

/** Which dismissals are possible on this delivery (ICC Laws 31-40 / playing conditions). */
export function allowedDismissals(extra: ExtraType, freeHit: boolean): DismissalType[] {
  if (freeHit) return ['run out', 'obstructing the field'];
  switch (extra) {
    case 'none':
      return ['bowled', 'caught', 'lbw', 'run out', 'stumped', 'hit wicket', 'obstructing the field'];
    case 'wide':
      return ['run out', 'stumped', 'hit wicket', 'obstructing the field'];
    case 'noball':
    case 'bye':
    case 'legbye':
      return ['run out', 'obstructing the field'];
  }
}

export interface Restriction {
  phase: string;
  maxOutside: number;
}

/**
 * Fielding restrictions (powerplays). T20 (20 ov): overs 1-6 = 2 outside, then 5.
 * ODI (50 ov): 1-10 = 2 outside, 11-40 = 4, 41-50 = 5. Other lengths are scaled
 * (<=20 overs: 30% powerplay, otherwise 20%/60%/20%).
 */
export function restrictionFor(s: MatchState, inn: Innings, overIdx: number): Restriction | null {
  if (!isLimited(s.setup) || inn.oversLimit === null) return null;
  const n = inn.oversLimit;
  const over = overIdx + 1;
  if (inn.kind === 'super') return { phase: 'Powerplay', maxOutside: 2 };
  if (n <= 20) {
    const pp = n === 20 ? 6 : Math.max(1, Math.round(n * 0.3));
    return over <= pp ? { phase: 'Powerplay', maxOutside: 2 } : { phase: 'Middle / death', maxOutside: 5 };
  }
  const pp1 = n === 50 ? 10 : Math.max(1, Math.round(n * 0.2));
  const pp3 = n === 50 ? 10 : Math.max(1, Math.round(n * 0.2));
  if (over <= pp1) return { phase: 'Powerplay 1', maxOutside: 2 };
  if (over > n - pp3) return { phase: 'Powerplay 3', maxOutside: 5 };
  return { phase: 'Powerplay 2', maxOutside: 4 };
}

/* ------------------------------------------------------------------ */
/* Creating a match / innings                                          */
/* ------------------------------------------------------------------ */

function firstBattingTeam(setup: MatchSetup): TeamIdx {
  return setup.tossDecision === 'bat' ? setup.tossWinner : other(setup.tossWinner);
}

function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th'][n] ?? `${n + 1}th`;
}

function makeInnings(
  s: MatchState,
  index: number,
  battingTeam: TeamIdx,
  kind: 'normal' | 'super',
  target: number | null,
): Innings {
  const setup = s.setup;
  const limited = isLimited(setup);
  const superOver = kind === 'super';
  return {
    index,
    label: superOver ? `Super Over ${Math.floor((index - 2) / 2) + 1}` : `${ordinal(s.innings.filter((i) => i.kind === 'normal').length)} innings`,
    kind,
    battingTeam,
    bowlingTeam: other(battingTeam),
    oversLimit: superOver ? 1 : limited ? setup.oversPerInnings : null,
    maxWickets: superOver ? 2 : setup.playersPerSide - 1,
    target,
    deliveries: [],
    striker: null,
    nonStriker: null,
    bowler: null,
    lastOverBowler: null,
    battingOrder: [],
    closed: false,
    closeReason: null,
    dls: false,
  };
}

export function newMatch(setup: MatchSetup): MatchState {
  const s: MatchState = {
    setup,
    innings: [],
    phase: 'live',
    pending: null,
    day: 1,
    followOn: false,
    result: null,
    winner: null,
  };
  s.innings.push(makeInnings(s, 0, firstBattingTeam(setup), 'normal', null));
  return s;
}

/* ------------------------------------------------------------------ */
/* Players at the crease / bowler selection                            */
/* ------------------------------------------------------------------ */

export function dismissedIds(inn: Innings): Set<string> {
  const out = new Set<string>();
  for (const d of inn.deliveries) if (d.wicket && countsAsWicket(d)) out.add(d.wicket.playerOutId);
  return out;
}

/** Batters who can still come in (not out, not already at the crease). Includes retired-hurt returns. */
export function eligibleBatters(s: MatchState, inn: Innings): string[] {
  const out = dismissedIds(inn);
  return s.setup.teams[inn.battingTeam].players
    .filter((p) => !p.sub)
    .map((p) => p.id)
    .filter((id) => !out.has(id) && id !== inn.striker && id !== inn.nonStriker);
}

export function bowlerError(s: MatchState, inn: Innings, id: string): string | null {
  if (!s.setup.teams[inn.bowlingTeam].players.some((p) => p.id === id && !p.sub)) return 'Bowler must be one of the fielding side players (extra players cannot bowl).';
  if (inn.lastOverBowler === id) return 'A bowler cannot bowl two consecutive overs.';
  const max = maxOversPerBowler(s, inn);
  if (max !== null && bowlerBalls(inn, id) >= max * 6) return `A bowler may bowl at most ${max} over${max === 1 ? '' : 's'} in this innings.`;
  return null;
}

export function eligibleBowlers(s: MatchState, inn: Innings): string[] {
  return s.setup.teams[inn.bowlingTeam].players
    .filter((p) => !p.sub)
    .map((p) => p.id)
    .filter((id) => bowlerError(s, inn, id) === null);
}

export function setOpeners(s: MatchState, strikerId: string, nonStrikerId: string, bowlerId: string): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (inn.striker || inn.nonStriker || inn.deliveries.length > 0) return 'Openers are already set.';
  if (!strikerId || !nonStrikerId) return 'Pick both opening batters.';
  if (strikerId === nonStrikerId) return 'The two openers must be different players.';
  const team = s.setup.teams[inn.battingTeam].players.filter((p) => !p.sub);
  if (!team.some((p) => p.id === strikerId) || !team.some((p) => p.id === nonStrikerId)) return 'Openers must be from the batting team.';
  if (!bowlerId) return 'Pick the opening bowler.';
  const err = bowlerError(s, inn, bowlerId);
  if (err) return err;
  inn.striker = strikerId;
  inn.nonStriker = nonStrikerId;
  inn.battingOrder = [strikerId, nonStrikerId];
  inn.bowler = bowlerId;
  return null;
}

export function setBowler(s: MatchState, bowlerId: string): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (inn.bowler) return 'The current over is still in progress.';
  const err = bowlerError(s, inn, bowlerId);
  if (err) return err;
  inn.bowler = bowlerId;
  return null;
}

export function setNextBatter(s: MatchState, playerId: string): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (inn.striker && inn.nonStriker) return 'Both batters are already at the crease.';
  if (!eligibleBatters(s, inn).includes(playerId)) return 'That player cannot bat now.';
  if (!inn.striker) inn.striker = playerId;
  else inn.nonStriker = playerId;
  if (!inn.battingOrder.includes(playerId)) inn.battingOrder.push(playerId);
  return null;
}

/* ------------------------------------------------------------------ */
/* Recording deliveries                                                */
/* ------------------------------------------------------------------ */

function validateWicket(inn: Innings, input: BallInput, freeHit: boolean): string | null {
  const w = input.wicket;
  if (!w) return null;
  const allowed = allowedDismissals(input.extra, freeHit);
  if (!allowed.includes(w.type)) {
    const why = freeHit ? 'on a free hit' : input.extra === 'none' ? '' : `on a ${input.extra === 'noball' ? 'no-ball' : input.extra === 'legbye' ? 'leg-bye' : input.extra}`;
    return `${w.type} is not allowed ${why}`.trim() + '.';
  }
  if (w.playerOutId !== inn.striker && w.playerOutId !== inn.nonStriker) return 'The dismissed batter must be at the crease.';
  if (STRIKER_ONLY.includes(w.type) && w.playerOutId !== inn.striker) return `Only the striker can be out ${w.type}.`;
  if (STRIKER_ONLY.includes(w.type) && input.runs !== 0) return `No runs can be scored when the batter is out ${w.type}.`;
  if ((w.type === 'caught' || w.type === 'stumped') && !w.fielderId) return `Pick the fielder for ${w.type}.`;
  return null;
}

export function bowlerRunsOf(d: Delivery): number {
  if (d.kind !== 'ball') return 0;
  if (d.extra === 'bye' || d.extra === 'legbye') return 0;
  if (d.extra === 'noball') return 1 + (d.runsSource === 'bat' ? d.runs : 0);
  return d.totalRuns; // none (bat runs) and wide (1 + runs)
}

export function recordBall(s: MatchState, input: BallInput): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (!inn.striker || !inn.nonStriker) return 'Select the incoming batter first.';
  if (!inn.bowler) return 'Select the bowler for this over first.';
  const { extra, runs } = input;
  if (!Number.isInteger(runs) || runs < 0 || runs > 7) return 'Invalid number of runs.';
  if (input.boundary && runs !== 4 && runs !== 6) return 'A boundary must be 4 or 6 runs.';
  if (input.wicket && input.boundary) return 'A boundary and a wicket cannot be recorded on the same ball.';

  const freeHit = freeHitActive(s, inn);
  const err = validateWicket(inn, input, freeHit);
  if (err) return err;

  const wide = extra === 'wide';
  const noball = extra === 'noball';
  const legal = !wide && !noball;
  const runsSource: RunsSource =
    extra === 'none' ? 'bat' : wide ? 'wide' : extra === 'bye' ? 'bye' : extra === 'legbye' ? 'legbye' : (input.runsSource ?? 'bat');
  const totalRuns = wide || noball ? 1 + runs : runs;
  const legalBefore = legalBalls(inn);

  const d: Delivery = {
    seq: inn.deliveries.length,
    kind: 'ball',
    over: Math.floor(legalBefore / 6),
    legal,
    striker: inn.striker,
    nonStriker: inn.nonStriker,
    bowler: inn.bowler,
    extra,
    runs,
    runsSource,
    boundary: !!input.boundary,
    totalRuns,
    penaltyRuns: 0,
    freeHit,
    day: s.day,
    wicket: input.wicket
      ? {
          type: input.wicket.type,
          playerOutId: input.wicket.playerOutId,
          fielderId: input.wicket.fielderId ?? null,
          bowlerCredit: BOWLER_CREDIT.includes(input.wicket.type),
        }
      : null,
  };
  inn.deliveries.push(d);

  const swap = () => {
    const t = inn.striker;
    inn.striker = inn.nonStriker;
    inn.nonStriker = t;
  };

  // Batters cross on odd runs (not on boundaries).
  if (!input.boundary && runs % 2 === 1) swap();

  // Dismissed batter leaves; the slot stays empty until the next batter is chosen.
  if (d.wicket) {
    if (inn.striker === d.wicket.playerOutId) inn.striker = null;
    else inn.nonStriker = null;
  }

  // End of over: batters change ends, bowler must be re-selected.
  if (legal && legalBefore + 1 === (d.over + 1) * 6) {
    swap();
    inn.lastOverBowler = inn.bowler;
    inn.bowler = null;
  }

  checkClose(s, inn);
  return null;
}

/** 5 penalty runs (ICC Law 41.18 etc.) awarded to the batting side. */
export function recordPenalty(s: MatchState, runs = 5): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  inn.deliveries.push(eventDelivery(s, inn, { totalRuns: runs, penaltyRuns: runs, wicket: null }));
  checkClose(s, inn);
  return null;
}

export function retireBatter(s: MatchState, playerId: string, kind: 'hurt' | 'out'): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (playerId !== inn.striker && playerId !== inn.nonStriker) return 'Only a batter at the crease can retire.';
  inn.deliveries.push(
    eventDelivery(s, inn, {
      totalRuns: 0,
      penaltyRuns: 0,
      wicket: { type: kind === 'hurt' ? 'retired hurt' : 'retired out', playerOutId: playerId, fielderId: null, bowlerCredit: false },
    }),
  );
  if (inn.striker === playerId) inn.striker = null;
  else inn.nonStriker = null;
  checkClose(s, inn);
  return null;
}

/** The incoming batter was not ready within the allowed time (ICC Law 40). */
export function timedOutBatter(s: MatchState, playerId: string): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (inn.striker && inn.nonStriker) return 'Timed out can only be given when a new batter is due.';
  if (!eligibleBatters(s, inn).includes(playerId)) return 'That player cannot be timed out.';
  if (!inn.battingOrder.includes(playerId)) inn.battingOrder.push(playerId);
  inn.deliveries.push(
    eventDelivery(s, inn, {
      totalRuns: 0,
      penaltyRuns: 0,
      wicket: { type: 'timed out', playerOutId: playerId, fielderId: null, bowlerCredit: false },
    }),
  );
  checkClose(s, inn);
  return null;
}

function eventDelivery(
  s: MatchState,
  inn: Innings,
  p: { totalRuns: number; penaltyRuns: number; wicket: Delivery['wicket'] },
): Delivery {
  return {
    seq: inn.deliveries.length,
    kind: 'event',
    over: Math.floor(legalBalls(inn) / 6),
    legal: false,
    striker: inn.striker ?? '',
    nonStriker: inn.nonStriker ?? '',
    bowler: inn.bowler ?? '',
    extra: 'none',
    runs: 0,
    runsSource: 'bat',
    boundary: false,
    totalRuns: p.totalRuns,
    penaltyRuns: p.penaltyRuns,
    freeHit: false,
    day: s.day,
    wicket: p.wicket,
  };
}

/* ------------------------------------------------------------------ */
/* Closing innings, results                                            */
/* ------------------------------------------------------------------ */

function checkClose(s: MatchState, inn: Innings): void {
  if (inn.closed) return;
  const runs = runsOf(inn);
  let reason: string | null = null;
  if (inn.target !== null && runs >= inn.target) reason = 'Target reached';
  else if (wicketsOf(inn) >= inn.maxWickets) reason = 'All out';
  else if ((!inn.striker || !inn.nonStriker) && eligibleBatters(s, inn).length === 0 && inn.battingOrder.length > 0) reason = 'All out';
  else if (inn.oversLimit !== null && legalBalls(inn) >= inn.oversLimit * 6) reason = 'Overs completed';
  if (reason) closeInnings(s, inn, reason);
}

function closeInnings(s: MatchState, inn: Innings, reason: string): void {
  inn.closed = true;
  inn.closeReason = reason;
  s.pending = null;
  if (reason === 'Close of play') {
    finish(s, 'Match drawn', null);
    return;
  }
  if (isLimited(s.setup)) limitedAfter(s, inn);
  else testAfter(s, inn);
}

function finish(s: MatchState, result: string, winner: TeamIdx | null): void {
  s.phase = 'finished';
  s.pending = null;
  s.result = result;
  s.winner = winner;
}

const teamName = (s: MatchState, t: TeamIdx): string => s.setup.teams[t].name;

function limitedAfter(s: MatchState, inn: Innings): void {
  if (inn.kind === 'super') {
    if (inn.index % 2 === 0) {
      s.pending = 'next-innings';
      return;
    }
    const first = s.innings[inn.index - 1];
    const a = runsOf(first);
    const b = runsOf(inn);
    if (b > a) finish(s, `Match tied. ${teamName(s, inn.battingTeam)} won the Super Over`, inn.battingTeam);
    else if (a > b) finish(s, `Match tied. ${teamName(s, first.battingTeam)} won the Super Over`, first.battingTeam);
    else s.pending = 'super-over';
    return;
  }
  if (inn.index === 0) {
    s.pending = 'next-innings';
    return;
  }
  const first = s.innings[0];
  const target = inn.target ?? runsOf(first) + 1;
  const r = runsOf(inn);
  const dls = inn.dls ? ' (DLS method)' : '';
  if (r >= target) {
    const w = inn.maxWickets - wicketsOf(inn);
    finish(s, `${teamName(s, inn.battingTeam)} won by ${plural(w, 'wicket')}${dls}`, inn.battingTeam);
  } else if (r === target - 1) {
    s.pending = 'super-over';
  } else {
    finish(s, `${teamName(s, first.battingTeam)} won by ${plural(target - 1 - r, 'run')}${dls}`, first.battingTeam);
  }
}

function testAfter(s: MatchState, inn: Innings): void {
  const idx = inn.index;
  if (idx === 0) {
    s.pending = 'next-innings';
    return;
  }
  if (idx === 1) {
    const lead = runsOf(s.innings[0]) - runsOf(inn);
    s.pending = lead >= followOnThreshold(s.setup) ? 'follow-on-choice' : 'next-innings';
    return;
  }
  if (idx === 2) {
    const x = inn.battingTeam; // has now batted twice
    const y = other(x); // has batted once
    const xr = teamRuns(s, x);
    const yr = teamRuns(s, y);
    if (yr > xr) finish(s, `${teamName(s, y)} won by an innings and ${plural(yr - xr, 'run')}`, y);
    else if (yr === xr) finish(s, 'Match tied', null);
    else s.pending = 'next-innings';
    return;
  }
  // 4th innings
  const target = inn.target ?? 0;
  const r = runsOf(inn);
  if (inn.closeReason === 'Target reached') {
    finish(s, `${teamName(s, inn.battingTeam)} won by ${plural(inn.maxWickets - wicketsOf(inn), 'wicket')}`, inn.battingTeam);
  } else if (r === target - 1) {
    finish(s, 'Match tied', null);
  } else {
    finish(s, `${teamName(s, other(inn.battingTeam))} won by ${plural(target - 1 - r, 'run')}`, other(inn.battingTeam));
  }
}

/** Start the next innings (after one has closed), including the follow-on choice and super overs. */
export function startNextInnings(s: MatchState, followOn?: boolean): string | null {
  if (s.phase !== 'live' || s.pending === null) return 'There is no innings to start.';
  const last = current(s)!;
  const idx = s.innings.length;
  let inn: Innings;

  if (s.pending === 'super-over') {
    // The team that batted second bats first in the Super Over (and alternates each round).
    inn = makeInnings(s, idx, last.battingTeam, 'super', null);
  } else if (s.pending === 'follow-on-choice') {
    if (followOn === undefined) return 'Choose whether to enforce the follow-on.';
    s.followOn = followOn;
    const i0 = s.innings[0];
    const i1 = s.innings[1];
    inn = makeInnings(s, idx, followOn ? i1.battingTeam : i0.battingTeam, 'normal', null);
  } else if (last.kind === 'super') {
    inn = makeInnings(s, idx, other(last.battingTeam), 'super', runsOf(last) + 1);
  } else if (isLimited(s.setup)) {
    inn = makeInnings(s, idx, other(last.battingTeam), 'normal', runsOf(last) + 1);
  } else if (idx === 1) {
    inn = makeInnings(s, idx, other(last.battingTeam), 'normal', null);
  } else if (idx === 2) {
    s.followOn = false;
    inn = makeInnings(s, idx, s.innings[0].battingTeam, 'normal', null);
  } else {
    const chaser = other(last.battingTeam);
    inn = makeInnings(s, idx, chaser, 'normal', teamRuns(s, last.battingTeam) - teamRuns(s, chaser) + 1);
  }
  s.innings.push(inn);
  s.pending = null;
  return null;
}

/** Declare (Test) or close the innings early (rain, time...). */
export function endInnings(s: MatchState, reason: 'Declared' | 'Innings closed' | 'Close of play'): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (reason === 'Declared' && isLimited(s.setup)) return 'Declarations are only possible in Test matches.';
  closeInnings(s, inn, reason);
  return null;
}

export function endMatch(s: MatchState, kind: 'draw' | 'tie' | 'no-result'): string | null {
  if (s.phase !== 'live') return 'The match is already finished.';
  const inn = current(s);
  if (inn && !inn.closed) {
    inn.closed = true;
    inn.closeReason = 'Match ended';
  }
  if (kind === 'draw') finish(s, 'Match drawn', null);
  else if (kind === 'tie') finish(s, 'Match tied', null);
  else finish(s, 'No result', null);
  return null;
}

/** Test: close the day's play. Going past the scheduled days draws the match. */
export function closeDay(s: MatchState): string | null {
  if (isLimited(s.setup)) return 'Only Test matches are played over several days.';
  if (s.phase !== 'live') return 'The match is already finished.';
  s.day++;
  if (s.day > s.setup.days) {
    const inn = current(s);
    if (inn && !inn.closed) {
      inn.closed = true;
      inn.closeReason = 'Close of play';
    }
    finish(s, 'Match drawn', null);
  }
  return null;
}

/** Revise overs (and, for the chase, the target) after an interruption - enter DLS figures here. */
export function reviseInnings(s: MatchState, overs: number, target?: number): string | null {
  const inn = current(s);
  if (!inn || inn.closed || s.phase !== 'live') return 'No innings in progress.';
  if (!isLimited(s.setup) || inn.kind !== 'normal') return 'Revisions only apply to limited-overs innings.';
  if (!Number.isInteger(overs) || overs < 1) return 'Enter a valid number of overs.';
  if (overs * 6 < legalBalls(inn)) return 'Revised overs cannot be fewer than overs already bowled.';
  inn.oversLimit = overs;
  inn.dls = true;
  if (inn.index === 1) {
    if (target === undefined || !Number.isInteger(target) || target < 1) return 'Enter the revised target.';
    inn.target = target;
  }
  checkClose(s, inn);
  return null;
}

/* ------------------------------------------------------------------ */
/* Scorecard                                                           */
/* ------------------------------------------------------------------ */

function howOutText(s: MatchState, d: Delivery): string {
  const w = d.wicket!;
  const b = playerName(s, d.bowler);
  const f = playerName(s, w.fielderId);
  switch (w.type) {
    case 'bowled':
      return `b ${b}`;
    case 'caught':
      return w.fielderId === d.bowler ? `c & b ${b}` : `c ${f} b ${b}`;
    case 'lbw':
      return `lbw b ${b}`;
    case 'stumped':
      return `st ${f} b ${b}`;
    case 'hit wicket':
      return `hit wicket b ${b}`;
    case 'run out':
      return f ? `run out (${f})` : 'run out';
    default:
      return w.type;
  }
}

export function summarize(s: MatchState, inn: Innings): InningsSummary {
  const batTeam = s.setup.teams[inn.battingTeam];
  const bowlTeam = s.setup.teams[inn.bowlingTeam];
  const batters = new Map<string, BatterLine>();
  const bowlers = new Map<string, BowlerLine>();
  const fow: FowLine[] = [];
  const extras = { wides: 0, noballs: 0, byes: 0, legbyes: 0, penalty: 0, total: 0 };

  const batter = (id: string): BatterLine => {
    let b = batters.get(id);
    if (!b) {
      b = {
        id,
        name: playerName(s, id),
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: 0,
        out: false,
        retiredHurt: false,
        atCrease: false,
        onStrike: false,
        howOut: 'not out',
      };
      batters.set(id, b);
    }
    return b;
  };
  const bowler = (id: string): BowlerLine => {
    let b = bowlers.get(id);
    if (!b) {
      b = { id, name: playerName(s, id), balls: 0, overs: '0.0', maidens: 0, runs: 0, wickets: 0, wides: 0, noballs: 0, economy: 0 };
      bowlers.set(id, b);
    }
    return b;
  };
  for (const id of inn.battingOrder) batter(id);

  let runs = 0;
  let wickets = 0;
  let legal = 0;
  let partRuns = 0;
  let partBalls = 0;

  for (const d of inn.deliveries) {
    runs += d.totalRuns;
    partRuns += d.totalRuns;
    if (d.kind === 'ball') {
      const bw = bowler(d.bowler);
      const st = batter(d.striker);
      bw.runs += bowlerRunsOf(d);
      if (d.extra === 'wide') {
        extras.wides += d.totalRuns;
        bw.wides++;
      } else if (d.extra === 'noball') {
        extras.noballs += 1;
        bw.noballs++;
        if (d.runsSource === 'bye') extras.byes += d.runs;
        if (d.runsSource === 'legbye') extras.legbyes += d.runs;
      } else if (d.extra === 'bye') extras.byes += d.runs;
      else if (d.extra === 'legbye') extras.legbyes += d.runs;

      if (d.extra !== 'wide') st.balls++;
      if (d.runsSource === 'bat' && (d.extra === 'none' || d.extra === 'noball')) {
        st.runs += d.runs;
        if (d.boundary && d.runs === 4) st.fours++;
        if (d.boundary && d.runs === 6) st.sixes++;
      }
      if (d.legal) {
        legal++;
        partBalls++;
        bw.balls++;
      }
      if (d.wicket && d.wicket.bowlerCredit) bw.wickets++;
    } else {
      extras.penalty += d.penaltyRuns;
    }
    if (d.wicket) {
      const out = batter(d.wicket.playerOutId);
      if (d.wicket.type === 'retired hurt') {
        out.retiredHurt = true;
        out.howOut = 'retired hurt';
      } else {
        wickets++;
        out.out = true;
        out.retiredHurt = false;
        out.howOut = howOutText(s, d);
        fow.push({ n: wickets, score: runs, playerId: out.id, name: out.name, over: oversText(legal) });
        partRuns = 0;
        partBalls = 0;
      }
    }
  }
  extras.total = extras.wides + extras.noballs + extras.byes + extras.legbyes + extras.penalty;

  // Maidens: a completed over with no runs charged to the bowler.
  const overs = new Map<number, Delivery[]>();
  for (const d of inn.deliveries) {
    if (d.kind !== 'ball') continue;
    const list = overs.get(d.over) ?? [];
    list.push(d);
    overs.set(d.over, list);
  }
  for (const list of overs.values()) {
    const legalCount = list.filter((d) => d.legal).length;
    const unique = new Set(list.map((d) => d.bowler));
    if (legalCount === 6 && unique.size === 1 && list.every((d) => bowlerRunsOf(d) === 0)) bowler(list[0].bowler).maidens++;
  }

  for (const b of batters.values()) {
    b.atCrease = b.id === inn.striker || b.id === inn.nonStriker;
    b.onStrike = b.id === inn.striker;
    if (b.atCrease) b.retiredHurt = false;
    b.strikeRate = b.balls ? (b.runs / b.balls) * 100 : 0;
    if (b.atCrease || (!b.out && !b.retiredHurt)) b.howOut = 'not out';
  }
  for (const b of bowlers.values()) {
    b.overs = oversText(b.balls);
    b.economy = b.balls ? (b.runs / b.balls) * 6 : 0;
  }

  const didNotBat = batTeam.players.filter((p) => !p.sub && !inn.battingOrder.includes(p.id)).map((p) => p.name);
  const overIdx = Math.floor(legal / 6);
  void bowlTeam;

  return {
    runs,
    wickets,
    legalBalls: legal,
    overs: oversText(legal),
    runRate: legal ? (runs / legal) * 6 : 0,
    extras,
    batters: [...batters.values()],
    bowlers: [...bowlers.values()],
    fow,
    didNotBat,
    partnershipRuns: partRuns,
    partnershipBalls: partBalls,
    thisOver: inn.deliveries.filter((d) => d.kind === 'ball' && d.over === overIdx),
  };
}

/** Short label for a delivery chip: 0, 1, 4, W, Wd, Nb+2, 1Lb ... */
export function chipText(d: Delivery): string {
  if (d.wicket && d.wicket.type !== 'retired hurt') {
    const base = d.extra === 'wide' ? 'Wd' : d.extra === 'noball' ? 'Nb' : '';
    return `${base}W`;
  }
  switch (d.extra) {
    case 'wide':
      return d.runs ? `Wd+${d.runs}` : 'Wd';
    case 'noball':
      return d.runs ? `Nb+${d.runs}` : 'Nb';
    case 'bye':
      return `${d.runs}B`;
    case 'legbye':
      return `${d.runs}Lb`;
    default:
      return String(d.runs);
  }
}

/** Test-match position: lead / trail for the batting side across the match. */
export function testPosition(s: MatchState, inn: Innings): { diff: number; needs: number | null } {
  const bat = teamRuns(s, inn.battingTeam);
  const opp = teamRuns(s, inn.bowlingTeam);
  return { diff: bat - opp, needs: inn.target !== null ? inn.target - runsOf(inn) : null };
}

export function oversBowledToday(s: MatchState): number {
  let n = 0;
  for (const inn of s.innings) for (const d of inn.deliveries) if (d.kind === 'ball' && d.legal && d.day === s.day) n++;
  return n;
}
