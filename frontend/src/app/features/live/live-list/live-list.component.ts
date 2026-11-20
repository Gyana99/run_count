import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchListItem } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { MatchCardComponent } from '../../../shared/components/match-card/match-card.component';

const REFRESH_MS = 10000;

/** Public page: every match, live ones first. No login needed. */
@Component({
  selector: 'app-live-list',
  standalone: true,
  imports: [RouterLink, MatchCardComponent],
  templateUrl: './live-list.component.html',
  styleUrl: './live-list.component.scss',
})
export class LiveListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly matches = signal<MatchListItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    void this.load();
    const timer = setInterval(() => void this.load(), REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private async load(): Promise<void> {
    try {
      this.matches.set(await this.api.listMatches('public'));
      this.error.set('');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load matches.');
    } finally {
      this.loading.set(false);
    }
  }
}
