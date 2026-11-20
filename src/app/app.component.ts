import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatchService } from './match.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly svc = inject(MatchService);
  private readonly router = inject(Router);

  newMatch(): void {
    if (confirm('Discard the current match and start a new one?')) {
      this.svc.reset();
      this.router.navigateByUrl('/');
    }
  }
}
