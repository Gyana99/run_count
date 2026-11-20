import { Component, computed, inject, signal } from '@angular/core';
import {
  STRIKER_ONLY,
  allowedDismissals,
  chipText,
  closeDay,
  current,
  eligibleBatters,
  eligibleBowlers,
  endInnings,
  endMatch,
  freeHitActive,
  isLimited,
  maxOversPerBowler,
  oversBowledToday,
  oversText,
  playerName,
  recordBall,
  recordPenalty,
  restrictionFor,
  retireBatter,
  reviseInnings,
  setBowler,
  setNextBatter,
  setOpeners,
  startNextInnings,
  summarize,
  testPosition,
  timedOutBatter,
} from '../../../core/engine/engine';
import { BoardComponent } from '../../../shared/components/board/board.component';
import { MatchService } from '../../../core/services/match.service';
import { BallInput, Delivery, DismissalType, ExtraType } from '../../../core/models/models';

@Component({
  selector: 'app-scoring',
  standalone: true,
  imports: [BoardComponent],
  templateUrl: './scoring.component.html',
  styleUrl: './scoring.component.scss',
})
export class ScoringComponent {
  private readonly svc = inject(MatchService);
  protected readonly Math = Math;
  protected readonly playerName = playerName;

  protected readonly extraOptions: { v: ExtraType; l: string }[] = [
    { v: 'none', l: 'Normal' },
    { v: 'wide', l: 'Wide' },
    { v: 'noball', l: 'No ball' },
    { v: 'bye', l: 'Bye' },
    { v: 'legbye', l: 'Leg bye' },
  ];

  readonly s = computed(() => this.svc.state()!);
  readonly inn = computed(() => current(this.s())!);
  readonly sum = computed(() => summarize(this.s(), this.inn()));

  readonly extra = signal<ExtraType>('none');
  readonly nbSource = signal<'bat' | 'bye' | 'legbye'>('bat');
  readonly wicketOn = signal(false);
  readonly wType = signal<DismissalType>('bowled');
  readonly wOut = signal('');
  readonly wFielder = signal('');

  readonly openStriker = signal('');
  readonly openNon = signal('');
  readonly openBowler = signal('');
  readonly nextBatter = signal('');
  readonly nextBowler = signal('');
  readonly revOvers = signal(10);
  readonly revTarget = signal(1);

  readonly freeHit = computed(() => freeHitActive(this.s(), this.inn()));
  readonly allowed = computed(() => allowedDismissals(this.extra(), this.freeHit()));
  readonly restriction = computed(() => restrictionFor(this.s(), this.inn(), Math.floor(this.sum().legalBalls / 6)));
  readonly bowlerQuota = computed(() => maxOversPerBowler(this.s(), this.inn()));
  readonly ballsLeft = computed(() => (this.inn().oversLimit ?? 0) * 6 - this.sum().legalBalls);

  readonly needsOpeners = computed(() => {
    const i = this.inn();
    return !i.closed && i.battingOrder.length === 0;
  });
  readonly needsBatter = computed(() => {
    const i = this.inn();
    return !i.closed && i.battingOrder.length > 0 && (!i.striker || !i.nonStriker);
  });
  readonly needsBowler = computed(() => {
    const i = this.inn();
    return !i.closed && !!i.striker && !!i.nonStriker && !i.bowler;
  });
  readonly canScore = computed(() => {
    const i = this.inn();
    return !i.closed && !!i.striker && !!i.nonStriker && !!i.bowler;
  });

  readonly batPlayers = computed(() => this.s().setup.teams[this.inn().battingTeam].players.filter((p) => !p.sub));
  readonly fielders = computed(() => this.s().setup.teams[this.inn().bowlingTeam].players);
  readonly batterOptions = computed(() =>
    eligibleBatters(this.s(), this.inn()).map((id) => ({ id, name: playerName(this.s(), id) })),
  );
  readonly bowlerOptions = computed(() => {
    const s = this.s();
    const i = this.inn();
    // Before the innings starts nobody has bowled, so the full bowling side is available.
    const ids = i.battingOrder.length === 0 ? s.setup.teams[i.bowlingTeam].players.filter((p) => !p.sub).map((p) => p.id) : eligibleBowlers(s, i);
    return ids.map((id) => ({ id, name: playerName(s, id) }));
  });

  readonly runTiles = computed(() => String(this.sum().runs).split(''));
  readonly overRow = computed(() => {
    const balls = this.sum().thisOver;
    const legal = balls.filter((d) => d.legal).length;
    return { balls, empties: Array.from({ length: Math.max(0, 6 - legal) }) };
  });

  readonly crease = computed(() => this.sum().batters.filter((b) => b.atCrease));
  readonly curBowler = computed(() => {
    const id = this.inn().bowler;
    return id ? this.sum().bowlers.find((b) => b.id === id) : undefined;
  });

  readonly strikerOnly = computed(() => STRIKER_ONLY.includes(this.wType()));
  readonly needsFielder = computed(() => ['caught', 'stumped', 'run out'].includes(this.wType()));

  readonly preview = computed(() => {
    const s = this.s();
    if (!s.pending || s.pending === 'follow-on-choice') return null;
    const c = structuredClone(s);
    if (startNextInnings(c)) return null;
    const i = current(c)!;
    return { label: i.label, team: c.setup.teams[i.battingTeam].name, target: i.target };
  });

  isLimited = () => isLimited(this.s().setup);
  isTest = () => !isLimited(this.s().setup);
  todayOvers = () => oversText(oversBowledToday(this.s()));
  chip = chipText;

  ballClass(d: Delivery): string {
    if (d.wicket && d.wicket.type !== 'retired hurt') return 'wicket';
    if (d.boundary && d.runs === 6) return 'six';
    if (d.boundary && d.runs === 4) return 'four';
    if (d.extra !== 'none') return 'extra';
    return d.totalRuns === 0 ? 'dot' : 'run';
  }

  formatLabel(): string {
    const st = this.s().setup;
    if (st.format === 'TEST') return `Test, ${st.days} days, ${st.oversPerDay} overs a day`;
    return `${st.format === 'CUSTOM' ? 'Custom' : st.format}, ${st.oversPerInnings} overs`;
  }

  tossLine(): string {
    const st = this.s().setup;
    return `${st.teams[st.tossWinner].name} won the toss and chose to ${st.tossDecision}`;
  }

  position(): string {
    const p = testPosition(this.s(), this.inn());
    if (p.needs !== null) return `Need ${Math.max(p.needs, 0)} to win`;
    return p.diff >= 0 ? `Lead by ${p.diff}` : `Trail by ${-p.diff}`;
  }

  leadAfterFirst(): number {
    const s = this.s();
    const a = s.innings[0];
    const b = s.innings[1];
    return summarize(s, a).runs - summarize(s, b).runs;
  }

  followOnMargin(): number {
    const d = this.s().setup.days;
    return d >= 5 ? 200 : d >= 3 ? 150 : d === 2 ? 100 : 75;
  }

  hint(): string {
    switch (this.extra()) {
      case 'wide':
        return 'Wide: 1 penalty run is added automatically. Tap the extra runs run (FOUR = ball went to the boundary).';
      case 'noball':
        return 'No ball: 1 penalty run is added, the next ball is a free hit. Tap the runs scored.';
      case 'bye':
        return 'Bye: runs go to extras, not to the batter or bowler.';
      case 'legbye':
        return 'Leg bye: runs go to extras, not to the batter or bowler.';
      default:
        return 'Tap the runs scored off the bat. FOUR / SIX are boundaries.';
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }
  toType(v: string): DismissalType {
    return v as DismissalType;
  }

  setExtra(x: ExtraType): void {
    this.extra.set(x);
    const ok = allowedDismissals(x, this.freeHit());
    if (!ok.includes(this.wType())) this.wType.set(ok[0]);
  }

  toggleWicket(): void {
    const on = !this.wicketOn();
    this.wicketOn.set(on);
    if (on) {
      const ok = this.allowed();
      if (!ok.includes(this.wType())) this.wType.set(ok[0]);
    }
  }

  score(runs: number, boundary = false): void {
    const i = this.inn();
    const input: BallInput = { extra: this.extra(), runs, boundary };
    if (this.extra() === 'noball') input.runsSource = this.nbSource();
    if (this.wicketOn()) {
      const type = this.wType();
      const out = STRIKER_ONLY.includes(type) ? i.striker! : this.wOut() || i.striker!;
      input.wicket = { type, playerOutId: out, fielderId: this.wFielder() || null };
    }
    if (this.svc.act((d) => recordBall(d, input))) this.resetPad();
  }

  private resetPad(): void {
    this.extra.set('none');
    this.nbSource.set('bat');
    this.wicketOn.set(false);
    this.wOut.set('');
    this.wFielder.set('');
  }

  confirmOpeners(): void {
    this.svc.act((d) => setOpeners(d, this.openStriker(), this.openNon(), this.openBowler()));
  }
  confirmBatter(): void {
    if (this.svc.act((d) => setNextBatter(d, this.nextBatter()))) this.nextBatter.set('');
  }
  markTimedOut(): void {
    if (this.svc.act((d) => timedOutBatter(d, this.nextBatter()))) this.nextBatter.set('');
  }
  confirmBowler(): void {
    if (this.svc.act((d) => setBowler(d, this.nextBowler()))) this.nextBowler.set('');
  }
  startNext(followOn?: boolean): void {
    this.svc.act((d) => startNextInnings(d, followOn));
  }
  declareTie(): void {
    this.svc.act((d) => endMatch(d, 'tie'));
  }
  penalty(): void {
    this.svc.act((d) => recordPenalty(d));
  }
  retire(id: string, kind: 'hurt' | 'out'): void {
    this.svc.act((d) => retireBatter(d, id, kind));
  }
  closeInn(reason: 'Declared' | 'Innings closed' | 'Close of play'): void {
    this.svc.act((d) => endInnings(d, reason));
  }
  nextDay(): void {
    this.svc.act((d) => closeDay(d));
  }
  finishMatch(kind: 'draw' | 'no-result'): void {
    this.svc.act((d) => endMatch(d, kind));
  }
  revise(): void {
    this.svc.act((d) => reviseInnings(d, this.revOvers(), this.inn().index === 1 ? this.revTarget() : undefined));
  }
}
