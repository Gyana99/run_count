import {
  allowedDismissals,
  closeDay,
  current,
  eligibleBatters,
  eligibleBowlers,
  endInnings,
  followOnThreshold,
  freeHitActive,
  legalBalls,
  matchSummary,
  maxOversPerBowler,
  newMatch,
  recordBall,
  recordPenalty,
  runsOf,
  setBowler,
  setNextBatter,
  setOpeners,
  startNextInnings,
  summarize,
  wicketsOf,
} from './engine';
import { BallInput, MatchSetup, MatchState } from '../models/models';

function setup(over: Partial<MatchSetup> = {}): MatchSetup {
  const mk = (t: number) => Array.from({ length: 11 }, (_, i) => ({ id: `${t}-${i}`, name: `T${t}P${i + 1}` }));
  return {
    title: 'Test',
    venue: 'Eden Gardens',
    date: '2026-11-19',
    format: 'T20',
    oversPerInnings: 20,
    days: 5,
    oversPerDay: 90,
    playersPerSide: 11,
    teams: [
      { name: 'India', players: mk(0) },
      { name: 'Australia', players: mk(1) },
    ],
    tossWinner: 0,
    tossDecision: 'bat',
    ...over,
  };
}

const ball = (s: MatchState, input: Partial<BallInput> = {}) => {
  const e = recordBall(s, { extra: 'none', runs: 0, ...input });
  expect(e).toBeNull();
};

/** Start innings with openers 0-0 / 0-1 (or 1-0 / 1-1) and bowler. */
function openInnings(s: MatchState, bowlerIdx = 0): void {
  const inn = current(s)!;
  const b = inn.battingTeam;
  const f = inn.bowlingTeam;
  expect(setOpeners(s, `${b}-0`, `${b}-1`, `${f}-${bowlerIdx}`)).toBeNull();
}

function overOfDots(s: MatchState): void {
  for (let i = 0; i < 6; i++) ball(s);
}

describe('engine - basics', () => {
  it('toss decides the first batting team', () => {
    expect(current(newMatch(setup({ tossWinner: 0, tossDecision: 'bat' })))!.battingTeam).toBe(0);
    expect(current(newMatch(setup({ tossWinner: 0, tossDecision: 'bowl' })))!.battingTeam).toBe(1);
    expect(current(newMatch(setup({ tossWinner: 1, tossDecision: 'bat' })))!.battingTeam).toBe(1);
  });

  it('wide = 1 penalty run and does not count as a ball; wide boundary scores 5', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { extra: 'wide' });
    ball(s, { extra: 'wide', runs: 4, boundary: true });
    const inn = current(s)!;
    expect(runsOf(inn)).toBe(6);
    expect(legalBalls(inn)).toBe(0);
    expect(summarize(s, inn).extras.wides).toBe(6);
  });

  it('odd runs swap strike, boundaries do not, over end swaps', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { runs: 1 });
    expect(current(s)!.striker).toBe('0-1');
    ball(s, { runs: 4, boundary: true });
    expect(current(s)!.striker).toBe('0-1');
    ball(s, { runs: 4 }); // ran four
    expect(current(s)!.striker).toBe('0-1');
    ball(s);
    ball(s);
    ball(s);
    expect(current(s)!.striker).toBe('0-0'); // end of over swap
    expect(current(s)!.bowler).toBeNull();
  });

  it('no-ball: free hit follows, only run out allowed, wides keep the free hit', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { extra: 'noball' });
    expect(freeHitActive(s, current(s)!)).toBe(true);
    ball(s, { extra: 'wide' });
    expect(freeHitActive(s, current(s)!)).toBe(true);
    expect(recordBall(s, { extra: 'none', runs: 0, wicket: { type: 'bowled', playerOutId: '0-0' } })).toMatch(/not allowed/);
    ball(s, { runs: 2 }); // free hit used up
    expect(freeHitActive(s, current(s)!)).toBe(false);
    expect(allowedDismissals('noball', false)).toEqual(['run out', 'obstructing the field']);
  });

  it('batter credited with bat runs off a no-ball; byes off a no-ball are extras', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { extra: 'noball', runs: 4, boundary: true, runsSource: 'bat' });
    ball(s, { extra: 'noball', runs: 2, runsSource: 'bye' });
    const sum = summarize(s, current(s)!);
    expect(sum.runs).toBe(5 + 3);
    expect(sum.batters[0].runs).toBe(4);
    expect(sum.extras.noballs).toBe(2);
    expect(sum.extras.byes).toBe(2);
    expect(sum.bowlers[0].runs).toBe(5 + 1);
  });

  it('byes and leg-byes are not charged to the bowler; maiden detection', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { extra: 'bye', runs: 1 });
    ball(s, { extra: 'legbye', runs: 1 });
    ball(s);
    ball(s);
    ball(s);
    ball(s);
    const b = summarize(s, current(s)!).bowlers[0];
    expect(b.runs).toBe(0);
    expect(b.maidens).toBe(1);
  });

  it('wicket types: bowler credit, run outs are not credited, caught needs a fielder', () => {
    const s = newMatch(setup());
    openInnings(s);
    expect(recordBall(s, { extra: 'none', runs: 0, wicket: { type: 'caught', playerOutId: '0-0' } })).toMatch(/fielder/);
    ball(s, { wicket: { type: 'caught', playerOutId: '0-0', fielderId: '1-5' } });
    expect(current(s)!.striker).toBeNull();
    expect(recordBall(s, { extra: 'none', runs: 0 })).toMatch(/incoming batter/);
    expect(setNextBatter(s, '0-2')).toBeNull();
    expect(current(s)!.striker).toBe('0-2'); // new batter takes strike after a catch
    ball(s, { runs: 1, wicket: { type: 'run out', playerOutId: '0-1', fielderId: '1-3' } });
    const sum = summarize(s, current(s)!);
    expect(sum.wickets).toBe(2);
    expect(sum.bowlers[0].wickets).toBe(1);
    expect(sum.fow.length).toBe(2);
    // stumped not allowed off a no-ball
    expect(setNextBatter(s, '0-3')).toBeNull();
    expect(recordBall(s, { extra: 'noball', runs: 0, wicket: { type: 'stumped', playerOutId: current(s)!.striker!, fielderId: '1-1' } })).toMatch(/not allowed/);
  });
});

describe('engine - bowler rules', () => {
  it('no consecutive overs and one-fifth quota', () => {
    const s = newMatch(setup());
    openInnings(s);
    overOfDots(s);
    expect(setBowler(s, '1-0')).toMatch(/consecutive/);
    expect(setBowler(s, '1-1')).toBeNull();
    expect(maxOversPerBowler(s, current(s)!)).toBe(4);
    const odi = newMatch(setup({ format: 'ODI', oversPerInnings: 50 }));
    expect(maxOversPerBowler(odi, current(odi)!)).toBe(10);
  });

  it('quota is enforced', () => {
    const s = newMatch(setup());
    openInnings(s); // 1-0 bowls over 1
    for (let o = 0; o < 7; o++) {
      overOfDots(s);
      expect(setBowler(s, o % 2 === 0 ? '1-1' : '1-0')).toBeNull();
    }
    overOfDots(s); // over 8 by 1-1; 1-0 has bowled overs 1,3,5,7
    expect(setBowler(s, '1-0')).toMatch(/at most 4/);
    expect(setBowler(s, '1-2')).toBeNull();
  });
});

describe('engine - innings and results (T20)', () => {
  it('all out ends the innings and chase win is by wickets', () => {
    const s = newMatch(setup({ playersPerSide: 3, oversPerInnings: 5 }));
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    ball(s, { wicket: { type: 'bowled', playerOutId: current(s)!.striker! } });
    expect(setNextBatter(s, '0-2')).toBeNull();
    ball(s, { wicket: { type: 'lbw', playerOutId: current(s)!.striker! } });
    expect(current(s)!.closed).toBe(true);
    expect(current(s)!.closeReason).toBe('All out');
    expect(s.pending).toBe('next-innings');

    expect(startNextInnings(s)).toBeNull();
    const chase = current(s)!;
    expect(chase.battingTeam).toBe(1);
    expect(chase.target).toBe(5);
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    expect(s.phase).toBe('live');
    ball(s, { runs: 1 });
    expect(s.phase).toBe('finished');
    expect(s.result).toBe('Australia won by 2 wickets');
  });

  it('defending side wins by runs', () => {
    const s = newMatch(setup({ playersPerSide: 3, oversPerInnings: 1 }));
    openInnings(s);
    ball(s, { runs: 6, boundary: true });
    overOfDotsFrom(s, 5);
    startNextInnings(s);
    openInnings(s);
    overOfDotsFrom(s, 6);
    expect(s.result).toBe('India won by 6 runs');
  });

  it('tie goes to a super over', () => {
    const s = newMatch(setup({ playersPerSide: 3, oversPerInnings: 1 }));
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    overOfDotsFrom(s, 5);
    startNextInnings(s);
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    overOfDotsFrom(s, 5);
    expect(s.phase).toBe('live');
    expect(s.pending).toBe('super-over');
    expect(startNextInnings(s)).toBeNull();
    const so1 = current(s)!;
    expect(so1.kind).toBe('super');
    expect(so1.battingTeam).toBe(1); // team that batted second bats first
    expect(so1.maxWickets).toBe(2);
    openInnings(s);
    ball(s, { runs: 6, boundary: true });
    overOfDotsFrom(s, 5);
    startNextInnings(s);
    openInnings(s);
    ball(s, { runs: 6, boundary: true });
    ball(s, { runs: 1 });
    expect(s.result).toBe('Match tied. India won the Super Over');
  });

  it('5 penalty runs are added as extras', () => {
    const s = newMatch(setup());
    openInnings(s);
    expect(recordPenalty(s)).toBeNull();
    const sum = summarize(s, current(s)!);
    expect(sum.runs).toBe(5);
    expect(sum.extras.penalty).toBe(5);
  });
});

function overOfDotsFrom(s: MatchState, n: number): void {
  for (let i = 0; i < n; i++) ball(s);
}

describe('engine - Test match', () => {
  const testSetup = () => setup({ format: 'TEST', days: 5 });

  it('follow-on thresholds follow ICC', () => {
    expect(followOnThreshold(setup({ days: 5 }))).toBe(200);
    expect(followOnThreshold(setup({ days: 4 }))).toBe(150);
    expect(followOnThreshold(setup({ days: 2 }))).toBe(100);
    expect(followOnThreshold(setup({ days: 1 }))).toBe(75);
  });

  it('no free hit in Tests, no overs limit, declaration allowed', () => {
    const s = newMatch(testSetup());
    openInnings(s);
    ball(s, { extra: 'noball' });
    expect(freeHitActive(s, current(s)!)).toBe(false);
    expect(current(s)!.oversLimit).toBeNull();
    expect(endInnings(s, 'Declared')).toBeNull();
    expect(s.pending).toBe('next-innings');
  });

  it('follow-on choice appears for a 200+ lead and the follow-on team bats again', () => {
    const s = newMatch(testSetup());
    openInnings(s);
    for (let i = 0; i < 60; i++) recordPenalty(s); // 300 runs
    endInnings(s, 'Declared');
    startNextInnings(s);
    openInnings(s);
    ball(s, { runs: 1 });
    endInnings(s, 'Declared');
    expect(s.pending).toBe('follow-on-choice');
    expect(startNextInnings(s)).toMatch(/Choose/);
    expect(startNextInnings(s, true)).toBeNull();
    expect(current(s)!.battingTeam).toBe(1);
    openInnings(s);
    ball(s, { runs: 1 });
    endInnings(s, 'Declared');
    // India 300 vs Australia 2 -> India win by an innings and 298 runs
    expect(s.phase).toBe('finished');
    expect(s.result).toBe('India won by an innings and 298 runs');
  });

  it('4th innings chase: win by wickets and day limits draw the match', () => {
    const s = newMatch(testSetup());
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    endInnings(s, 'Declared');
    startNextInnings(s);
    openInnings(s);
    ball(s, { runs: 1 });
    endInnings(s, 'Declared');
    expect(s.pending).toBe('next-innings');
    startNextInnings(s); // India 3rd
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    endInnings(s, 'Declared');
    startNextInnings(s);
    const inn4 = current(s)!;
    expect(inn4.battingTeam).toBe(1);
    expect(inn4.target).toBe(8 - 1 + 1);
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    ball(s, { runs: 4, boundary: true });
    expect(s.result).toBe('Australia won by 10 wickets');
    expect(wicketsOf(current(s)!)).toBe(0);
  });

  it('draw after the last scheduled day', () => {
    const s = newMatch(setup({ format: 'TEST', days: 2 }));
    openInnings(s);
    expect(closeDay(s)).toBeNull();
    expect(s.day).toBe(2);
    expect(closeDay(s)).toBeNull();
    expect(s.result).toBe('Match drawn');
  });
});

describe('engine - players per side and extra players', () => {
  /** 13 players a side plus 2 extra players; the extras are ids 13 and 14. */
  const big = () => {
    const mk = (t: number) =>
      Array.from({ length: 15 }, (_, i) => ({ id: `${t}-${i}`, name: `T${t}P${i + 1}`, ...(i >= 13 ? { sub: true } : {}) }));
    return setup({
      playersPerSide: 13,
      teams: [
        { name: 'India', players: mk(0) },
        { name: 'Australia', players: mk(1) },
      ],
    });
  };

  it('13 a side: the innings lasts until 12 wickets', () => {
    const s = newMatch(big());
    expect(current(s)!.maxWickets).toBe(12);
  });

  it('extra players cannot open the batting or the bowling', () => {
    const s = newMatch(big());
    expect(setOpeners(s, '0-13', '0-1', '1-0')).toMatch(/batting team/);
    expect(setOpeners(s, '0-0', '0-1', '1-14')).toMatch(/extra players cannot bowl/);
    expect(setOpeners(s, '0-0', '0-1', '1-0')).toBeNull();
  });

  it('extra players are never offered as the next batter or as a bowler', () => {
    const s = newMatch(big());
    openInnings(s);
    const inn = current(s)!;
    const batters = eligibleBatters(s, inn);
    expect(batters.length).toBe(11);
    expect(batters).not.toContain('0-13');
    expect(eligibleBowlers(s, inn)).not.toContain('1-14');
    expect(setNextBatter(s, '0-13')).toMatch(/Both batters|cannot bat/);
  });

  it('an extra player can take a catch, and does not appear under "did not bat"', () => {
    const s = newMatch(big());
    openInnings(s);
    ball(s, { wicket: { type: 'caught', playerOutId: '0-0', fielderId: '1-14' } });
    expect(setNextBatter(s, '0-2')).toBeNull();
    const sum = summarize(s, current(s)!);
    expect(sum.batters[0].howOut).toBe('c T1P15 b T1P1');
    expect(sum.didNotBat.length).toBe(10);
    expect(sum.didNotBat).not.toContain('T0P14');
  });
});

describe('engine - match summary for the match list', () => {
  it('has one line per innings and marks the one in progress', () => {
    const s = newMatch(setup());
    openInnings(s);
    ball(s, { runs: 4, boundary: true });
    ball(s, { extra: 'wide' });
    ball(s, { wicket: { type: 'bowled', playerOutId: current(s)!.striker! } });
    const sum = matchSummary(s);
    expect(sum.scores.length).toBe(1);
    expect(sum.scores[0]).toEqual({ team: 'India', label: '1st innings', runs: 5, wickets: 1, overs: '0.2', current: true });
  });

  it('nothing is current once the match has finished', () => {
    const s = newMatch(setup({ playersPerSide: 3, oversPerInnings: 1 }));
    openInnings(s);
    ball(s, { runs: 6, boundary: true });
    overOfDotsFrom(s, 5);
    startNextInnings(s);
    openInnings(s);
    overOfDotsFrom(s, 6);
    expect(s.phase).toBe('finished');
    const sum = matchSummary(s);
    expect(sum.scores.map((x) => x.current)).toEqual([false, false]);
    expect(sum.scores.map((x) => x.runs)).toEqual([6, 0]);
  });
});
