export type MatchFormat = 'T20' | 'ODI' | 'TEST' | 'CUSTOM';
export type TeamIdx = 0 | 1;
export type ExtraType = 'none' | 'wide' | 'noball' | 'bye' | 'legbye';
export type RunsSource = 'bat' | 'bye' | 'legbye' | 'wide';
export type DismissalType =
  | 'bowled'
  | 'caught'
  | 'lbw'
  | 'run out'
  | 'stumped'
  | 'hit wicket'
  | 'obstructing the field'
  | 'retired out'
  | 'timed out'
  | 'retired hurt';

export interface Player {
  id: string;
  name: string;
  /** Extra player (substitute): may field, but cannot bat or bowl. */
  sub?: boolean;
}

export interface Team {
  name: string;
  players: Player[];
}

/** Everything collected on the "new match" screen. */
export interface MatchSetup {
  title: string;
  venue: string;
  date: string;
  format: MatchFormat;
  /** Limited-overs only: overs per innings. */
  oversPerInnings: number;
  /** Test only: scheduled days and minimum overs per day (ICC: 90). */
  days: number;
  oversPerDay: number;
  playersPerSide: number;
  teams: [Team, Team];
  tossWinner: TeamIdx;
  tossDecision: 'bat' | 'bowl';
}

export interface Wicket {
  type: DismissalType;
  playerOutId: string;
  fielderId: string | null;
  /** True when the bowler is credited with the wicket. */
  bowlerCredit: boolean;
}

export interface Delivery {
  seq: number;
  /** 'ball' = a delivery; 'event' = penalty runs, retirement, timed out. */
  kind: 'ball' | 'event';
  /** 0-based over number this delivery belongs to. */
  over: number;
  legal: boolean;
  striker: string;
  nonStriker: string;
  bowler: string;
  extra: ExtraType;
  /** Runs scored/run on the ball, excluding the 1-run wide/no-ball penalty. */
  runs: number;
  runsSource: RunsSource;
  boundary: boolean;
  totalRuns: number;
  penaltyRuns: number;
  freeHit: boolean;
  day: number;
  wicket: Wicket | null;
}

export interface Innings {
  index: number;
  label: string;
  kind: 'normal' | 'super';
  battingTeam: TeamIdx;
  bowlingTeam: TeamIdx;
  oversLimit: number | null;
  maxWickets: number;
  target: number | null;
  deliveries: Delivery[];
  striker: string | null;
  nonStriker: string | null;
  bowler: string | null;
  lastOverBowler: string | null;
  battingOrder: string[];
  closed: boolean;
  closeReason: string | null;
  dls: boolean;
}

export type Pending = 'next-innings' | 'follow-on-choice' | 'super-over' | null;

export interface MatchState {
  setup: MatchSetup;
  innings: Innings[];
  phase: 'live' | 'finished';
  pending: Pending;
  day: number;
  followOn: boolean;
  result: string | null;
  winner: TeamIdx | null;
}

export interface BallInput {
  extra: ExtraType;
  /** Runs run / scored on the ball (not counting the 1-run wide / no-ball penalty). */
  runs: number;
  /** For no-balls: where the runs came from. */
  runsSource?: 'bat' | 'bye' | 'legbye';
  /** True if the runs were a boundary (4 or 6): batters do not change ends. */
  boundary?: boolean;
  wicket?: { type: DismissalType; playerOutId: string; fielderId?: string | null };
}

export interface BatterLine {
  id: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  out: boolean;
  retiredHurt: boolean;
  atCrease: boolean;
  onStrike: boolean;
  howOut: string;
}

export interface BowlerLine {
  id: string;
  name: string;
  balls: number;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  wides: number;
  noballs: number;
  economy: number;
}

export interface FowLine {
  n: number;
  score: number;
  playerId: string;
  name: string;
  over: string;
}

export interface Extras {
  wides: number;
  noballs: number;
  byes: number;
  legbyes: number;
  penalty: number;
  total: number;
}

export interface InningsSummary {
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  runRate: number;
  extras: Extras;
  batters: BatterLine[];
  bowlers: BowlerLine[];
  fow: FowLine[];
  didNotBat: string[];
  partnershipRuns: number;
  partnershipBalls: number;
  thisOver: Delivery[];
}
