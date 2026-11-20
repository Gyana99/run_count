import { Component, computed, inject, input, signal } from '@angular/core';
import { summarize } from '../../../core/engine/engine';
import { MatchService } from '../../../core/services/match.service';
import { MatchState } from '../../../core/models/models';

@Component({
  selector: 'app-scorecard',
  standalone: true,
  templateUrl: './scorecard.component.html',
  styleUrl: './scorecard.component.scss',
})
export class ScorecardComponent {
  private readonly svc = inject(MatchService);
  /** Viewers pass the match in; the scorer's page uses the match being scored. */
  readonly match = input<MatchState | null>(null);
  /** Show the match title and result above the innings tabs (the live page already has them). */
  readonly showTitle = input(true);
  readonly s = computed(() => this.match() ?? this.svc.state()!);
  private readonly picked = signal<number | null>(null);

  readonly selected = computed(() => this.picked() ?? this.s().innings.length - 1);
  readonly data = computed(() => {
    const s = this.s();
    const inn = s.innings[this.selected()] ?? s.innings[s.innings.length - 1];
    return inn ? { inn, sum: summarize(s, inn) } : null;
  });

  pick(i: number): void {
    this.picked.set(i);
  }
}
