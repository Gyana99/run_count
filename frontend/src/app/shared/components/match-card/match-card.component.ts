import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchListItem } from '../../../core/models/api.models';

/** One match in a list: title, score lines and result. Extra buttons can be projected in. */
@Component({
  selector: 'app-match-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './match-card.component.html',
  styleUrl: './match-card.component.scss',
})
export class MatchCardComponent {
  readonly match = input.required<MatchListItem>();
  /** Router link for the card, for example ['/live', id]. */
  readonly link = input.required<unknown[]>();

  meta(): string {
    const m = this.match();
    const format = m.format === 'TEST' ? 'Test' : m.format === 'CUSTOM' ? 'Custom overs' : m.format;
    return [m.venue, m.matchDate, format].filter(Boolean).join(', ');
  }
}
