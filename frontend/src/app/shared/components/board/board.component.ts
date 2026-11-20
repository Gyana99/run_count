import { Component, computed, input } from '@angular/core';
import {
  ballClass,
  chipText,
  current,
  freeHitActive,
  isLimited,
  maxOversPerBowler,
  oversBowledToday,
  oversText,
  restrictionFor,
  summarize,
  testPosition,
} from '../../../core/engine/engine';
import { MatchState } from '../../../core/models/models';

/** The scoreboard: score tiles, run rate, target and match notes. Used by the scorer and by viewers. */
@Component({
  selector: 'app-board',
  standalone: true,
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss',
})
export class BoardComponent {
  readonly match = input.required<MatchState>();
  /** Show the six balls of the current over inside the board. */
  readonly showOver = input(false);
  /** Show the match title, venue and format at the top of the board. */
  readonly showHead = input(true);

  protected readonly Math = Math;
  protected readonly chip = chipText;
  protected readonly ballClass = ballClass;

  readonly inn = computed(() => current(this.match())!);
  readonly sum = computed(() => summarize(this.match(), this.inn()));
  readonly runTiles = computed(() => String(this.sum().runs).split(''));
  readonly freeHit = computed(() => freeHitActive(this.match(), this.inn()));
  readonly restriction = computed(() => restrictionFor(this.match(), this.inn(), Math.floor(this.sum().legalBalls / 6)));
  readonly bowlerQuota = computed(() => maxOversPerBowler(this.match(), this.inn()));
  readonly ballsLeft = computed(() => (this.inn().oversLimit ?? 0) * 6 - this.sum().legalBalls);
  readonly overRow = computed(() => {
    const balls = this.sum().thisOver;
    const legal = balls.filter((d) => d.legal).length;
    return { balls, empties: Array.from({ length: Math.max(0, 6 - legal) }) };
  });

  isTest = () => !isLimited(this.match().setup);
  todayOvers = () => oversText(oversBowledToday(this.match()));

  formatLabel(): string {
    const st = this.match().setup;
    if (st.format === 'TEST') return `Test, ${st.days} days, ${st.oversPerDay} overs a day`;
    return `${st.format === 'CUSTOM' ? 'Custom' : st.format}, ${st.oversPerInnings} overs`;
  }

  tossLine(): string {
    const st = this.match().setup;
    return `${st.teams[st.tossWinner].name} won the toss and chose to ${st.tossDecision}`;
  }

  position(): string {
    const p = testPosition(this.match(), this.inn());
    if (p.needs !== null) return `Need ${Math.max(p.needs, 0)} to win`;
    return p.diff >= 0 ? `Lead by ${p.diff}` : `Trail by ${-p.diff}`;
  }
}
