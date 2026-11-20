import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject } from 'rxjs';
import { MatchListItem, MatchRecord, MatchSummary } from './core/models/api.models';
import { ApiError, ApiService } from './core/services/api.service';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { matchSummary, newMatch, recordBall, setOpeners } from './core/engine/engine';
import { LoginComponent } from './features/auth/login/login.component';
import { MatchService } from './core/services/match.service';
import { MatchSetup, MatchState } from './core/models/models';
import { SetupComponent } from './features/scorer/setup/setup.component';

const players = (t: number) => Array.from({ length: 11 }, (_, i) => ({ id: `${t}-${i}`, name: `T${t}P${i + 1}` }));
const setup: MatchSetup = {
  title: 'Final',
  venue: 'Wankhede',
  date: '2026-11-19',
  format: 'T20',
  oversPerInnings: 20,
  days: 1,
  oversPerDay: 90,
  playersPerSide: 11,
  teams: [
    { name: 'India', players: players(0) },
    { name: 'Australia', players: players(1) },
  ],
  tossWinner: 1,
  tossDecision: 'bowl',
};

/** A match with the openers chosen, so the scoring keys are showing. */
function startedMatch(): MatchState {
  const s = newMatch(setup);
  expect(setOpeners(s, '0-0', '0-1', '1-0')).toBeNull();
  return s;
}

function record(state: MatchState, version: number, ownerId = 1): MatchRecord {
  const summary: MatchSummary = matchSummary(state);
  return {
    id: 'abc12345',
    version,
    ownerId,
    ownerName: 'sam',
    status: state.phase === 'finished' ? 'finished' : 'live',
    title: state.setup.title,
    venue: state.setup.venue,
    matchDate: state.setup.date,
    format: state.setup.format,
    result: state.result,
    summary,
    updatedAt: '2026-11-19T10:00:00.000Z',
    state,
  };
}

/** Stands in for the Node server. */
class FakeApi {
  matches: MatchListItem[] = [];
  rec: MatchRecord | null = null;
  readonly stream = new Subject<{ record?: MatchRecord; connected: boolean; deleted?: boolean }>();
  readonly saved: { id: string; version: number; state: MatchState }[] = [];
  readonly created: MatchState[] = [];
  loginCalls: string[] = [];

  async config() {
    return { allowRegistration: true };
  }
  async login(username: string) {
    this.loginCalls.push(username);
    return { token: 'token', user: { id: 1, username } };
  }
  async register(username: string) {
    return { token: 'token', user: { id: 1, username } };
  }
  async listMatches() {
    return this.matches;
  }
  async getMatch() {
    if (!this.rec) throw new ApiError('Match not found', 404);
    return this.rec;
  }
  async createMatch(state: MatchState) {
    this.created.push(state);
    return { id: 'abc12345', version: 1 };
  }
  async saveMatch(id: string, version: number, state: MatchState) {
    this.saved.push({ id, version, state });
    return { version: version + 1, updatedAt: '2026-11-19T10:01:00.000Z' };
  }
  async deleteMatch() {
    return;
  }
  streamMatch() {
    return this.stream.asObservable();
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('Run Count', () => {
  let api: FakeApi;

  beforeEach(() => {
    localStorage.clear();
    api = new FakeApi();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes), { provide: ApiService, useValue: api }],
    });
  });

  const signIn = (id = 1) => TestBed.inject(AuthService).setSession({ token: 't', user: { id, username: 'sam' } }, false);

  async function open(url: string) {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl(url);
    await tick();
    h.detectChanges();
    await tick();
    h.detectChanges();
    return h;
  }

  const click = (el: HTMLElement, text: string) => {
    const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));
    expect(btn).withContext(`button "${text}"`).toBeTruthy();
    btn!.click();
  };

  describe('public pages', () => {
    it('sends / to the match list and lists matches, live first', async () => {
      const live = record(startedMatch(), 3);
      api.matches = [{ ...live, status: 'live' } as MatchListItem];
      const h = await open('/');
      expect(TestBed.inject(Router).url).toBe('/live');
      const text = (h.routeNativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Final');
      expect(text).toContain('Live');
      expect(text).toContain('India');
    });

    it('shows an empty state when there are no matches', async () => {
      const h = await open('/live');
      expect((h.routeNativeElement as HTMLElement).textContent).toContain('No matches yet');
    });

    it('live page shows the score and follows updates; stale updates are ignored', async () => {
      const s1 = startedMatch();
      api.rec = record(s1, 2);
      const h = await open('/live/abc12345');
      const el = h.routeNativeElement as HTMLElement;
      const score = () => el.querySelector('.tiles')?.getAttribute('aria-label');
      expect(el.textContent).toContain('Final');
      expect(score()).toBe('0 for 0');

      const s2 = structuredClone(s1);
      expect(recordBall(s2, { extra: 'none', runs: 6, boundary: true })).toBeNull();
      api.stream.next({ connected: true, record: record(s2, 3) });
      h.detectChanges();
      expect(score()).toBe('6 for 0');
      expect(el.querySelectorAll('.board .ball:not(.empty)').length).toBe(1);

      api.stream.next({ connected: true, record: record(s1, 2) }); // older version
      h.detectChanges();
      expect(score()).toBe('6 for 0');
    });

    it('live page says when the match does not exist', async () => {
      const h = await open('/live/nope');
      expect((h.routeNativeElement as HTMLElement).textContent).toContain('Match not found');
    });
  });

  describe('login', () => {
    it('protects the scorer pages and returns you to the page you wanted', async () => {
      await open('/scorer');
      expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fscorer');
    });

    it('logs in and goes to the scorer page', async () => {
      const h = await RouterTestingHarness.create();
      const cmp = await h.navigateByUrl('/login?returnUrl=%2Fscorer', LoginComponent);
      cmp.username = 'sam';
      cmp.password = 'secret-pass';
      await cmp.submit();
      await tick();
      expect(api.loginCalls).toEqual(['sam']);
      expect(TestBed.inject(AuthService).user()?.username).toBe('sam');
      expect(TestBed.inject(Router).url).toBe('/scorer');
    });

    it('shows the server error and stays on the page', async () => {
      api.login = async () => {
        throw new ApiError('Wrong username or password', 401);
      };
      const h = await RouterTestingHarness.create();
      const cmp = await h.navigateByUrl('/login', LoginComponent);
      cmp.username = 'sam';
      cmp.password = 'nope-nope';
      await cmp.submit();
      h.detectChanges();
      expect((h.routeNativeElement as HTMLElement).textContent).toContain('Wrong username or password');
      expect(TestBed.inject(Router).url).toBe('/login');
    });

    it('does not follow a return link that leaves the app', async () => {
      signIn();
      await open('/login?returnUrl=%2F%2Fevil.example');
      expect(TestBed.inject(Router).url).toBe('/scorer');
    });

    it('header shows the log-in link, then the user name and Log out', async () => {
      const f = TestBed.createComponent(AppComponent);
      f.detectChanges();
      const el = f.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Scorer log in');
      signIn();
      f.detectChanges();
      expect(el.textContent).toContain('sam');
      expect(el.textContent).toContain('Log out');
    });
  });

  describe('scoring', () => {
    it('scores a ball on the scorer page and saves it with the right version', async () => {
      signIn();
      api.rec = record(startedMatch(), 5);
      const h = await open('/scorer/abc12345');
      const el = h.routeNativeElement as HTMLElement;
      const score = () => el.querySelector('.tiles')?.getAttribute('aria-label');
      expect(score()).toBe('0 for 0');

      click(el, '6');
      await tick();
      h.detectChanges();
      expect(score()).toBe('6 for 0');
      expect(api.saved.length).toBe(1);
      expect(api.saved[0].version).toBe(5);

      click(el, 'Wide');
      h.detectChanges();
      click(el, '1');
      await tick();
      h.detectChanges();
      expect(score()).toBe('8 for 0');
      expect(api.saved[1].version).toBe(6); // the version the server returned for the first save

      click(el, 'Undo last');
      await tick();
      h.detectChanges();
      expect(score()).toBe('6 for 0');
      expect(api.saved.length).toBe(3);
      expect(el.textContent).toContain('Saved');
    });

    it('keeps the change and retries when the server cannot be reached', async () => {
      signIn();
      api.rec = record(startedMatch(), 1);
      const h = await open('/scorer/abc12345');
      const svc = TestBed.inject(MatchService);
      const real = api.saveMatch.bind(api);
      api.saveMatch = async () => {
        throw new ApiError('Cannot reach the server. Check your connection.', 0);
      };
      click(h.routeNativeElement as HTMLElement, '1');
      await tick();
      expect(svc.saveStatus()).toBe('error');
      api.saveMatch = real;
      await svc['flush']();
      expect(svc.saveStatus()).toBe('saved');
      expect(api.saved.at(-1)?.state.innings[0].deliveries.length).toBe(1);
    });

    it('stops scoring when the match was changed somewhere else', async () => {
      signIn();
      api.rec = record(startedMatch(), 1);
      const h = await open('/scorer/abc12345');
      const svc = TestBed.inject(MatchService);
      api.saveMatch = async () => {
        throw new ApiError('This match was changed somewhere else. Reload to continue.', 409, 4);
      };
      click(h.routeNativeElement as HTMLElement, '2');
      await tick();
      h.detectChanges();
      expect(svc.saveStatus()).toBe('conflict');
      expect((h.routeNativeElement as HTMLElement).textContent).toContain('Reload match');
      expect(svc.act(() => null)).toBe(false);
    });

    it("sends you to the viewer page for someone else's match", async () => {
      signIn(1);
      api.rec = record(startedMatch(), 1, 2);
      await open('/scorer/abc12345');
      expect(TestBed.inject(Router).url).toBe('/live/abc12345');
    });
  });

  describe('setup', () => {
    it('creates the match on the server and opens it', async () => {
      signIn();
      api.rec = record(startedMatch(), 1);
      const h = await RouterTestingHarness.create();
      const cmp = await h.navigateByUrl('/scorer/new', SetupComponent);
      cmp.f.teams[0].name = 'India';
      cmp.f.teams[1].name = 'Australia';
      await cmp.start();
      await tick();
      expect(api.created.length).toBe(1);
      expect(api.created[0].setup.teams[0].name).toBe('India');
      expect(TestBed.inject(Router).url).toBe('/scorer/abc12345');
    });

    it('up to 13 players a side plus up to 2 extra fielders', async () => {
      signIn();
      const h = await RouterTestingHarness.create();
      const cmp = await h.navigateByUrl('/scorer/new', SetupComponent);
      const el = h.routeNativeElement as HTMLElement;
      const rows = () => el.querySelectorAll('.player').length;
      expect(rows()).toBe(26); // 2 teams x (11 + 2 extra)

      cmp.onPlayers(13);
      cmp.onExtras(2);
      h.detectChanges();
      expect(rows()).toBe(30); // 2 teams x (13 + 2)
      expect(el.querySelectorAll('.extras-note').length).toBe(2);

      cmp.onPlayers(20);
      cmp.onExtras(9);
      expect(cmp.f.playersPerSide).toBe(13);
      expect(cmp.f.extraPlayers).toBe(2);
      cmp.onPlayers(1);
      expect(cmp.f.playersPerSide).toBe(2);
    });
  });
});
