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
} from './engine';
import { MatchService } from './match.service';
import { BallInput, Delivery, DismissalType, ExtraType } from './models';

@Component({
  selector: 'app-scoring',
  standalone: true,
  template: `
    @let st = s();
    @let i = inn();
    @let sm = sum();

    <section class="board" [class.freehit]="freeHit()">
      <div class="board-head">
        <h2>{{ st.setup.title }}</h2>
        @if (st.setup.venue) {
          <span>{{ st.setup.venue }}</span>
        }
        <span>{{ formatLabel() }}</span>
      </div>

      <div class="board-face">
        <div class="who">
          <span class="team">{{ st.setup.teams[i.battingTeam].name }}</span>
          <span class="inn">{{ i.label }}</span>
        </div>
        <div class="tiles" role="img" [attr.aria-label]="sm.runs + ' for ' + sm.wickets">
          @for (c of runTiles(); track $index) {
            <span class="tile">{{ c }}</span>
          }
          <span class="slash">/</span>
          <span class="tile wkt">{{ sm.wickets }}</span>
        </div>
        <div class="overs">
          <strong>{{ sm.overs }}</strong>
          <span>@if (i.oversLimit) {of {{ i.oversLimit }} }overs</span>
        </div>
      </div>

      <dl class="figures">
        <div><dt>Run rate</dt><dd>{{ sm.runRate.toFixed(2) }}</dd></div>
        @if (i.target !== null) {
          <div><dt>Target</dt><dd>{{ i.target }}</dd></div>
          <div>
            <dt>Need</dt>
            <dd>{{ Math.max(i.target - sm.runs, 0) }}@if (i.oversLimit) {<small> off {{ ballsLeft() }}</small>}</dd>
          </div>
          @if (i.oversLimit && ballsLeft() > 0) {
            <div><dt>Required rate</dt><dd>{{ (Math.max(i.target - sm.runs, 0) / ballsLeft() * 6).toFixed(2) }}</dd></div>
          }
        }
        @if (isTest()) {
          <div><dt>Day</dt><dd>{{ st.day }} of {{ st.setup.days }}</dd></div>
          <div><dt>Overs today</dt><dd>{{ todayOvers() }}</dd></div>
          <div><dt>Position</dt><dd>{{ position() }}</dd></div>
        }
      </dl>

      <ul class="notes">
        @if (freeHit()) {
          <li class="hot">Free hit: only a run out can dismiss the batter</li>
        }
        @if (restriction(); as r) {
          <li>{{ r.phase }}: {{ r.maxOutside }} fielders outside the circle</li>
        }
        @if (bowlerQuota() !== null) {
          <li>Each bowler: {{ bowlerQuota() }} overs at most</li>
        }
        @if (isTest() && sm.legalBalls >= 480) {
          <li>New ball available</li>
        }
        @if (i.dls) {
          <li>Revised target (DLS)</li>
        }
      </ul>
      <p class="toss">{{ tossLine() }}</p>
    </section>

    @if (st.phase === 'finished') {
      <section class="panel result">
        <h2>{{ st.result }}</h2>
        <p class="muted">The match is finished. The Scorecard tab has the full details.</p>
      </section>
    } @else if (st.pending) {
      <section class="panel">
        @if (i.closed) {
          <p class="lead">
            {{ i.label }} closed ({{ i.closeReason }}). {{ st.setup.teams[i.battingTeam].name }} made {{ sm.runs }}/{{ sm.wickets }} in {{ sm.overs }} overs.
          </p>
        }
        @switch (st.pending) {
          @case ('follow-on-choice') {
            <p>
              {{ st.setup.teams[st.innings[0].battingTeam].name }} lead by {{ leadAfterFirst() }} runs. The ICC follow-on margin for this match is
              {{ followOnMargin() }}.
            </p>
            <div class="row">
              <button class="primary" (click)="startNext(true)">Enforce follow-on</button>
              <button (click)="startNext(false)">Bat again</button>
            </div>
          }
          @case ('super-over') {
            <p><strong>Scores are level.</strong> Each side plays one over with two wickets. The team that batted second bats first.</p>
            <div class="row">
              <button class="primary" (click)="startNext()">Start Super Over</button>
              <button (click)="declareTie()">Call it a tie</button>
            </div>
          }
          @default {
            @if (preview(); as p) {
              <p>Next: {{ p.label }}, {{ p.team }} to bat{{ p.target !== null ? ', target ' + p.target : '' }}.</p>
            }
            <button class="primary" (click)="startNext()">Start next innings</button>
          }
        }
      </section>
    } @else {
      @if (needsOpeners()) {
        <section class="panel">
          <h3>Openers and first bowler</h3>
          <div class="grid">
            <label>Striker
              <select (change)="openStriker.set(val($event))">
                <option value="">Choose…</option>
                @for (p of batPlayers(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </label>
            <label>Non-striker
              <select (change)="openNon.set(val($event))">
                <option value="">Choose…</option>
                @for (p of batPlayers(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </label>
            <label>Opening bowler
              <select (change)="openBowler.set(val($event))">
                <option value="">Choose…</option>
                @for (p of bowlerOptions(); track p.id) {
                  <option [value]="p.id">{{ p.name }}</option>
                }
              </select>
            </label>
          </div>
          <button class="primary" (click)="confirmOpeners()">Start innings</button>
        </section>
      } @else {
        @if (needsBatter()) {
          <section class="panel">
            <h3>A wicket fell: who comes in?</h3>
            <div class="grid">
              <label>Next batter
                <select (change)="nextBatter.set(val($event))">
                  <option value="">Choose…</option>
                  @for (p of batterOptions(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </label>
            </div>
            <div class="row">
              <button class="primary" (click)="confirmBatter()">Send in</button>
              <button (click)="markTimedOut()">Timed out</button>
            </div>
          </section>
        } @else if (needsBowler()) {
          <section class="panel">
            <h3>Over {{ Math.floor(sm.legalBalls / 6) + 1 }}: who bowls?</h3>
            <div class="grid">
              <label>Bowler
                <select (change)="nextBowler.set(val($event))">
                  <option value="">Choose…</option>
                  @for (p of bowlerOptions(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
              </label>
            </div>
            <button class="primary" (click)="confirmBowler()">Start over</button>
          </section>
        }

        <section class="panel">
          <div class="over">
            <span class="over-no">Over {{ Math.floor(sm.legalBalls / 6) + 1 }}</span>
            <ol class="balls" aria-label="Balls in this over">
              @for (d of overRow().balls; track d.seq) {
                <li [class]="'ball ' + ballClass(d)">{{ chip(d) }}</li>
              }
              @for (e of overRow().empties; track $index) {
                <li class="ball empty" aria-hidden="true"></li>
              }
            </ol>
          </div>

          <table class="mini">
            <thead><tr><th>Batter</th><th>Runs</th><th>Balls</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              @for (b of crease(); track b.id) {
                <tr [class.on]="b.onStrike">
                  <td>{{ b.name }}@if (b.onStrike) {<span class="sr-only"> (on strike)</span>}</td>
                  <td><strong>{{ b.runs }}</strong></td><td>{{ b.balls }}</td><td>{{ b.fours }}</td><td>{{ b.sixes }}</td><td>{{ b.strikeRate.toFixed(0) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <p class="muted">Partnership {{ sm.partnershipRuns }} runs off {{ sm.partnershipBalls }} balls</p>
          @if (curBowler(); as b) {
            <table class="mini">
              <thead><tr><th>Bowler</th><th>Overs</th><th>Maidens</th><th>Runs</th><th>Wkts</th><th>Econ</th></tr></thead>
              <tbody>
                <tr><td>{{ b.name }}</td><td>{{ b.overs }}</td><td>{{ b.maidens }}</td><td>{{ b.runs }}</td><td><strong>{{ b.wickets }}</strong></td><td>{{ b.economy.toFixed(1) }}</td></tr>
              </tbody>
            </table>
          }
        </section>

        <section class="panel">
          <details>
            <summary>More actions</summary>
            <div class="row">
              <button (click)="penalty()">Add 5 penalty runs</button>
              @for (b of crease(); track b.id) {
                <button (click)="retire(b.id, 'hurt')">{{ b.name }} retires hurt</button>
                <button (click)="retire(b.id, 'out')">{{ b.name }} retired out</button>
              }
            </div>
            @if (isLimited()) {
              <div class="row">
                <label class="inline">Revised overs <input type="number" min="1" [value]="revOvers()" (input)="revOvers.set(+val($event))" /></label>
                @if (i.index === 1) {
                  <label class="inline">Revised target <input type="number" min="1" [value]="revTarget()" (input)="revTarget.set(+val($event))" /></label>
                }
                <button (click)="revise()">Apply rain revision</button>
              </div>
              <div class="row">
                <button (click)="closeInn('Innings closed')">End innings now</button>
              </div>
            } @else {
              <div class="row">
                <button (click)="closeInn('Declared')">Declare innings</button>
                <button (click)="nextDay()">Close the day's play</button>
                <button (click)="closeInn('Close of play')">Close of play (draw)</button>
              </div>
            }
            <div class="row">
              <button (click)="finishMatch('no-result')">Abandon, no result</button>
              @if (isTest()) {
                <button (click)="finishMatch('draw')">End as a draw</button>
              }
            </div>
          </details>
        </section>

        @if (canScore()) {
          <section class="pad" aria-label="Score this ball">
            <div class="seg" role="group" aria-label="Type of delivery">
              @for (e of extraOptions; track e.v) {
                <button type="button" [class.on]="extra() === e.v" [attr.aria-pressed]="extra() === e.v" (click)="setExtra(e.v)">{{ e.l }}</button>
              }
            </div>
            @if (extra() === 'noball') {
              <div class="seg small" role="group" aria-label="Where the runs came from">
                <button type="button" [class.on]="nbSource() === 'bat'" (click)="nbSource.set('bat')">Off the bat</button>
                <button type="button" [class.on]="nbSource() === 'bye'" (click)="nbSource.set('bye')">Byes</button>
                <button type="button" [class.on]="nbSource() === 'legbye'" (click)="nbSource.set('legbye')">Leg byes</button>
              </div>
            }
            <p class="hint">{{ hint() }}</p>

            @if (wicketOn()) {
              <div class="wform">
                <label>How out
                  <select (change)="wType.set(toType(val($event)))">
                    @for (t of allowed(); track t) {
                      <option [value]="t" [selected]="t === wType()">{{ t }}</option>
                    }
                  </select>
                </label>
                @if (!strikerOnly()) {
                  <label>Batter out
                    <select (change)="wOut.set(val($event))">
                      <option value="">{{ playerName(st, i.striker) }} (striker)</option>
                      <option [value]="i.nonStriker ?? ''">{{ playerName(st, i.nonStriker) }} (non-striker)</option>
                    </select>
                  </label>
                }
                @if (needsFielder()) {
                  <label>{{ wType() === 'stumped' ? 'Wicket-keeper' : 'Fielder' }}
                    <select (change)="wFielder.set(val($event))">
                      <option value="">Choose…</option>
                      @for (p of fielders(); track p.id) {
                        <option [value]="p.id">{{ p.name }}</option>
                      }
                    </select>
                  </label>
                }
                <p class="hint">Tap the runs completed to record the wicket. Use 0 for most dismissals.</p>
              </div>
            }

            <div class="keys">
              @for (r of [0, 1, 2, 3]; track r) {
                <button class="key" (click)="score(r)">{{ r }}</button>
              }
              <button class="key" (click)="score(4)"><b>4</b><small>ran four</small></button>
              <button class="key" (click)="score(5)">5</button>
              <button class="key four" (click)="score(4, true)"><b>4</b><small>boundary</small></button>
              <button class="key six" (click)="score(6, true)"><b>6</b><small>boundary</small></button>
              <button class="key wk" [class.on]="wicketOn()" [attr.aria-pressed]="wicketOn()" (click)="toggleWicket()">
                {{ wicketOn() ? 'Cancel wicket' : 'Wicket' }}
              </button>
            </div>
          </section>
        }
      }
    }
  `,
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
