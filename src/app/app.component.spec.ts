import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import { setOpeners } from './engine';
import { MatchService } from './match.service';
import { MatchSetup } from './models';
import { ScoringComponent } from './scoring.component';
import { SetupComponent } from './setup.component';

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

describe('Run Count routes', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [AppComponent], providers: [provideRouter(routes)] });
  });

  const click = (el: HTMLElement, text: string) => {
    const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(text));
    expect(btn).withContext(`button "${text}"`).toBeTruthy();
    btn!.click();
  };

  it('shows the setup page at / when there is no match', async () => {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/');
    expect(h.routeNativeElement?.textContent).toContain('Who won the toss?');
  });

  it('sends /match and /scorecard back to setup when there is no match', async () => {
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/match');
    expect(TestBed.inject(Router).url).toBe('/');
    await h.navigateByUrl('/scorecard');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('sends / to the scorer once a match is running', async () => {
    TestBed.inject(MatchService).start(setup);
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/match');
  });

  it('scores balls on /match and undoes them', async () => {
    const svc = TestBed.inject(MatchService);
    svc.start(setup);
    svc.act((d) => setOpeners(d, '0-0', '0-1', '1-0'));
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/match', ScoringComponent);
    const el = h.routeNativeElement as HTMLElement;
    const score = () => el.querySelector('.tiles')?.getAttribute('aria-label');

    click(el, '6');
    h.detectChanges();
    expect(score()).toBe('6 for 0');

    click(el, 'Wide');
    h.detectChanges();
    click(el, '1');
    h.detectChanges();
    expect(score()).toBe('8 for 0');
    expect(el.querySelectorAll('.ball:not(.empty)').length).toBe(2);

    svc.undo();
    h.detectChanges();
    expect(score()).toBe('6 for 0');
  });

  it('shows the section links in the app shell', async () => {
    const f = TestBed.createComponent(AppComponent);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('ICC rules');
    expect((f.nativeElement as HTMLElement).textContent).toContain('New match');
  });

  it('setup: up to 13 players a side plus up to 2 extra fielders', async () => {
    const h = await RouterTestingHarness.create();
    const cmp = await h.navigateByUrl('/', SetupComponent);
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
