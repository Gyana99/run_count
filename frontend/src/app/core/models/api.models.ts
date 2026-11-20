import { MatchFormat, MatchState } from './models';

export interface User {
  id: number;
  username: string;
}

export interface AuthResult {
  token: string;
  user: User;
}

/** One line of the score summary: a single innings. */
export interface ScoreLine {
  team: string;
  label: string;
  runs: number;
  wickets: number;
  overs: string;
  current: boolean;
}

export interface MatchSummary {
  scores: ScoreLine[];
}

export interface MatchListItem {
  id: string;
  title: string;
  venue: string;
  matchDate: string;
  format: MatchFormat;
  status: 'live' | 'finished';
  result: string | null;
  summary: MatchSummary;
  ownerName: string;
  updatedAt: string;
  version: number;
}

export interface MatchRecord extends MatchListItem {
  ownerId: number;
  state: MatchState;
}
