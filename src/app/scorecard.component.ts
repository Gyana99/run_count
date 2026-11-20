import { Component, computed, inject, signal } from '@angular/core';
import { summarize } from './engine';
import { MatchService } from './match.service';

@Component({
  selector: 'app-scorecard',
  standalone: true,
  template: `
    @let st = s();
    <section class="card">
      <h2>{{ st.setup.title }}</h2>
      <p class="muted">{{ st.setup.venue }}{{ st.setup.venue ? ", " : "" }}{{ st.setup.date }}</p>
      @if (st.result) {
        <p class="resulttext">{{ st.result }}</p>
      }
      <div class="row tabs">
        @for (i of st.innings; track i.index) {
          <button [class.active]="selected() === i.index" (click)="pick(i.index)">
            {{ st.setup.teams[i.battingTeam].name }}, {{ i.label }}
          </button>
        }
      </div>
    </section>

    @if (data(); as d) {
      <section class="card">
        <h3>{{ st.setup.teams[d.inn.battingTeam].name }} batting: {{ d.sum.runs }}/{{ d.sum.wickets }} ({{ d.sum.overs }} ov)</h3>
        @if (d.inn.closeReason) {
          <p class="muted">{{ d.inn.closeReason }}</p>
        }
        <div class="scroll">
          <table>
            <thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              @for (b of d.sum.batters; track b.id) {
                <tr>
                  <td>{{ b.name }}{{ b.onStrike ? ' *' : '' }}</td>
                  <td class="muted">{{ b.howOut }}</td>
                  <td><strong>{{ b.runs }}</strong></td><td>{{ b.balls }}</td><td>{{ b.fours }}</td><td>{{ b.sixes }}</td><td>{{ b.strikeRate.toFixed(1) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p>
          <strong>Extras {{ d.sum.extras.total }}</strong>
          <span class="muted"> (b {{ d.sum.extras.byes }}, lb {{ d.sum.extras.legbyes }}, w {{ d.sum.extras.wides }}, nb {{ d.sum.extras.noballs }}, p {{ d.sum.extras.penalty }})</span>
        </p>
        <p><strong>Total {{ d.sum.runs }}/{{ d.sum.wickets }}</strong> <span class="muted">&nbsp;({{ d.sum.overs }} overs, RR {{ d.sum.runRate.toFixed(2) }})</span></p>
        @if (d.sum.didNotBat.length) {
          <p><span class="muted">Did not bat:</span> {{ d.sum.didNotBat.join(', ') }}</p>
        }
        @if (d.sum.fow.length) {
          <p>
            <span class="muted">Fall of wickets:</span>
            @for (f of d.sum.fow; track f.n) {
              <span>{{ f.score }}-{{ f.n }} ({{ f.name }}, {{ f.over }} ov){{ $last ? '' : ', ' }}</span>
            }
          </p>
        }
      </section>

      <section class="card">
        <h3>{{ st.setup.teams[d.inn.bowlingTeam].name }} bowling</h3>
        <div class="scroll">
          <table>
            <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Wd</th><th>Nb</th><th>Econ</th></tr></thead>
            <tbody>
              @for (b of d.sum.bowlers; track b.id) {
                <tr>
                  <td>{{ b.name }}</td><td>{{ b.overs }}</td><td>{{ b.maidens }}</td><td>{{ b.runs }}</td>
                  <td><strong>{{ b.wickets }}</strong></td><td>{{ b.wides }}</td><td>{{ b.noballs }}</td><td>{{ b.economy.toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
})
export class ScorecardComponent {
  private readonly svc = inject(MatchService);
  readonly s = computed(() => this.svc.state()!);
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
