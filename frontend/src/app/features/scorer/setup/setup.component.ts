import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatchService } from '../../../core/services/match.service';
import { MatchFormat, MatchSetup, Player, TeamIdx } from '../../../core/models/models';

interface TeamForm {
  name: string;
  players: Player[];
}

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.scss',
})
export class SetupComponent {
  private readonly svc = inject(MatchService);
  private readonly router = inject(Router);
  error = '';
  busy = false;
  readonly formats: { v: MatchFormat; l: string }[] = [
    { v: 'T20', l: 'T20' },
    { v: 'ODI', l: 'ODI' },
    { v: 'TEST', l: 'Test' },
    { v: 'CUSTOM', l: 'Custom' },
  ];

  f: {
    title: string;
    venue: string;
    date: string;
    format: MatchFormat;
    oversPerInnings: number;
    days: number;
    oversPerDay: number;
    playersPerSide: number;
    extraPlayers: number;
    teams: [TeamForm, TeamForm];
    tossWinner: TeamIdx;
    tossDecision: 'bat' | 'bowl';
  } = {
    title: '',
    venue: '',
    date: new Date().toISOString().slice(0, 10),
    format: 'T20',
    oversPerInnings: 20,
    days: 5,
    oversPerDay: 90,
    playersPerSide: 11,
    extraPlayers: 2,
    teams: [this.makeTeam(0, 'Team A', 13), this.makeTeam(1, 'Team B', 13)],
    tossWinner: 0,
    tossDecision: 'bat',
  };

  private makeTeam(t: number, name: string, n: number): TeamForm {
    return { name, players: Array.from({ length: n }, (_, i) => ({ id: `${t}-${i}`, name: '' })) };
  }

  onFormat(format: MatchFormat): void {
    this.f.format = format;
    if (format === 'T20') this.f.oversPerInnings = 20;
    else if (format === 'ODI') this.f.oversPerInnings = 50;
    else if (format === 'CUSTOM' && (this.f.oversPerInnings === 20 || this.f.oversPerInnings === 50)) this.f.oversPerInnings = 10;
  }

  readonly maxPlayersPerSide = 13;
  readonly maxExtraPlayers = 2;

  onPlayers(n: number): void {
    const count = Math.floor(Number(n));
    this.f.playersPerSide = Number.isFinite(count) ? Math.max(2, Math.min(this.maxPlayersPerSide, count)) : 11;
    this.resizeTeams();
  }

  onExtras(n: number): void {
    const count = Math.floor(Number(n));
    this.f.extraPlayers = Number.isFinite(count) ? Math.max(0, Math.min(this.maxExtraPlayers, count)) : 2;
    this.resizeTeams();
  }

  private resizeTeams(): void {
    const total = this.f.playersPerSide + this.f.extraPlayers;
    this.f.teams.forEach((team, t) => {
      while (team.players.length < total) team.players.push({ id: `${t}-${team.players.length}`, name: '' });
      team.players.length = total;
    });
  }

  tossWinnerName(): string {
    return this.f.teams[this.f.tossWinner].name || `Team ${this.f.tossWinner + 1}`;
  }
  firstBat(): string {
    const i = this.f.tossDecision === 'bat' ? this.f.tossWinner : this.f.tossWinner === 0 ? 1 : 0;
    return this.f.teams[i].name || `Team ${i + 1}`;
  }
  firstBowl(): string {
    const i = this.f.tossDecision === 'bat' ? (this.f.tossWinner === 0 ? 1 : 0) : this.f.tossWinner;
    return this.f.teams[i].name || `Team ${i + 1}`;
  }

  async start(): Promise<void> {
    const f = this.f;
    const names = f.teams.map((t) => t.name.trim());
    if (!names[0] || !names[1]) return this.fail('Enter both team names.');
    if (names[0].toLowerCase() === names[1].toLowerCase()) return this.fail('Team names must be different.');
    if (f.format !== 'TEST' && (!Number.isInteger(f.oversPerInnings) || f.oversPerInnings < 1)) return this.fail('Enter a valid number of overs.');
    if (f.format === 'TEST' && (!Number.isInteger(f.days) || f.days < 1 || f.days > 5)) return this.fail('Test matches are 1 to 5 days.');

    const teams = f.teams.map((t, ti) => ({
      name: t.name.trim(),
      players: t.players.map((p, i) => {
        const isSub = i >= f.playersPerSide;
        const fallback = isSub ? `${names[ti]} Extra ${i - f.playersPerSide + 1}` : `${names[ti]} P${i + 1}`;
        return { id: `${ti}-${i}`, name: p.name.trim() || fallback, ...(isSub ? { sub: true } : {}) };
      }),
    }));
    for (const t of teams) {
      const seen = new Set(t.players.map((p) => p.name.toLowerCase()));
      if (seen.size !== t.players.length) return this.fail(`${t.name}: player names must be different.`);
    }

    const setup: MatchSetup = {
      title: f.title.trim() || `${names[0]} vs ${names[1]}`,
      venue: f.venue.trim(),
      date: f.date,
      format: f.format,
      oversPerInnings: f.format === 'TEST' ? 0 : f.oversPerInnings,
      days: f.format === 'TEST' ? f.days : 1,
      oversPerDay: f.oversPerDay,
      playersPerSide: f.playersPerSide,
      teams: [teams[0], teams[1]],
      tossWinner: f.tossWinner,
      tossDecision: f.tossDecision,
    };
    this.error = '';
    this.busy = true;
    try {
      const id = await this.svc.create(setup);
      await this.router.navigate(['/scorer', id]);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not start the match. Try again.';
    } finally {
      this.busy = false;
    }
  }

  private fail(msg: string): void {
    this.error = msg;
  }
}
