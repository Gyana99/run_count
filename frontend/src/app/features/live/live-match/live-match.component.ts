import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatchRecord } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { BoardComponent } from '../../../shared/components/board/board.component';
import { current, summarize } from '../../../core/engine/engine';
import { ScorecardComponent } from '../../../shared/components/scorecard/scorecard.component';

/** Public page for one match: scoreboard, the current over, batters and the full scorecard, updated live. */
@Component({
  selector: 'app-live-match',
  standalone: true,
  imports: [DatePipe, RouterLink, BoardComponent, ScorecardComponent],
  templateUrl: './live-match.component.html',
  styleUrl: './live-match.component.scss',
})
export class LiveMatchComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private stream: Subscription | null = null;

  readonly record = signal<MatchRecord | null>(null);
  readonly connected = signal(false);
  readonly error = signal('');
  readonly deleted = signal(false);

  readonly atCrease = computed(() => {
    const r = this.record();
    if (!r || r.status !== 'live') return null;
    const inn = current(r.state);
    if (!inn || inn.closed) return null;
    const sum = summarize(r.state, inn);
    const batters = sum.batters.filter((b) => b.atCrease);
    const bowler = sum.bowlers.find((b) => b.id === inn.bowler) ?? null;
    return batters.length ? { batters, bowler, partnershipRuns: sum.partnershipRuns, partnershipBalls: sum.partnershipBalls } : null;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => this.open(p.get('id') ?? ''));
    this.destroyRef.onDestroy(() => this.stream?.unsubscribe());
  }

  private open(id: string): void {
    this.stream?.unsubscribe();
    this.record.set(null);
    this.error.set('');
    this.deleted.set(false);
    this.connected.set(false);

    this.api
      .getMatch(id)
      .then((r) => this.accept(r))
      .catch((e: unknown) => {
        if (!this.record()) this.error.set(e instanceof Error ? e.message : 'Could not load the match.');
      });

    this.stream = this.api.streamMatch(id).subscribe((ev) => {
      this.connected.set(ev.connected);
      if (ev.record) this.accept(ev.record);
      if (ev.deleted) this.deleted.set(true);
    });
  }

  /** Ignore anything older than what is already on screen. */
  private accept(r: MatchRecord): void {
    const cur = this.record();
    if (!cur || r.version >= cur.version) this.record.set(r);
  }

  meta(r: MatchRecord): string {
    const format = r.format === 'TEST' ? 'Test' : r.format === 'CUSTOM' ? 'Custom overs' : r.format;
    return [r.venue, r.matchDate, format].filter(Boolean).join(', ');
  }

  statusText(r: MatchRecord): string {
    if (r.status === 'finished') return 'Finished';
    return this.connected() ? 'Live' : 'Reconnecting…';
  }
}
