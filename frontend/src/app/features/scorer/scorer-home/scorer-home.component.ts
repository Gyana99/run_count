import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchListItem } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { MatchCardComponent } from '../../../shared/components/match-card/match-card.component';

/** The scorer's own matches, and the button to start a new one. */
@Component({
  selector: 'app-scorer-home',
  standalone: true,
  imports: [RouterLink, MatchCardComponent],
  templateUrl: './scorer-home.component.html',
  styleUrl: './scorer-home.component.scss',
})
export class ScorerHomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  readonly matches = signal<MatchListItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.matches.set(await this.api.listMatches('mine'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not load your matches.');
    } finally {
      this.loading.set(false);
    }
  }

  async remove(m: MatchListItem): Promise<void> {
    if (!confirm(`Delete "${m.title}"? Viewers will lose the scorecard. This cannot be undone.`)) return;
    try {
      await this.api.deleteMatch(m.id);
      this.matches.update((list) => list.filter((x) => x.id !== m.id));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not delete the match.');
    }
  }
}
