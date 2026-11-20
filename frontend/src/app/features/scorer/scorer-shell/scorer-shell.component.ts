import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { MatchService } from '../../../core/services/match.service';

/** Wraps the scorer's pages for one match: loads it, shows the save status and the Score / Scorecard switch. */
@Component({
  selector: 'app-scorer-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './scorer-shell.component.html',
  styleUrl: './scorer-shell.component.scss',
})
export class ScorerShellComponent {
  protected readonly svc = inject(MatchService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly id = signal('');
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly copied = signal(false);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => void this.open(p.get('id') ?? ''));
  }

  private async open(id: string): Promise<void> {
    this.id.set(id);
    this.loading.set(true);
    this.loadError.set('');
    try {
      await this.svc.load(id);
      const owner = this.svc.ownerId();
      const me = this.auth.user();
      // Only the scorer who started a match can change it; anyone else gets the viewer page.
      if (owner !== null && me && owner !== me.id) await this.router.navigate(['/live', id]);
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not open the match.');
    } finally {
      this.loading.set(false);
    }
  }

  saveText(): string {
    switch (this.svc.saveStatus()) {
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'Saved';
      case 'error':
        return 'Not saved yet. Trying again…';
      case 'conflict':
        return 'Changed somewhere else';
      default:
        return '';
    }
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      await this.svc.reload();
    } catch (e) {
      this.loadError.set(e instanceof Error ? e.message : 'Could not reload the match.');
    } finally {
      this.loading.set(false);
    }
  }

  async copyLink(): Promise<void> {
    const url = `${location.origin}/live/${this.id()}`;
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      window.prompt('Copy this link for viewers:', url);
    }
  }
}
