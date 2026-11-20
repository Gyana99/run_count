import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'live' },

  // Public pages: anyone can watch
  {
    path: 'live',
    title: 'Matches - Run Count',
    loadComponent: () => import('./features/live/live-list/live-list.component').then((m) => m.LiveListComponent),
  },
  {
    path: 'live/:id',
    title: 'Live score - Run Count',
    loadComponent: () => import('./features/live/live-match/live-match.component').then((m) => m.LiveMatchComponent),
  },
  {
    path: 'rules',
    title: 'ICC rules - Run Count',
    loadComponent: () => import('./features/rules/rules.component').then((m) => m.RulesComponent),
  },
  {
    path: 'login',
    title: 'Log in - Run Count',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },

  // Scorer pages: need a login
  {
    path: 'scorer',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Your matches - Run Count',
        loadComponent: () => import('./features/scorer/scorer-home/scorer-home.component').then((m) => m.ScorerHomeComponent),
      },
      {
        path: 'new',
        title: 'New match - Run Count',
        loadComponent: () => import('./features/scorer/setup/setup.component').then((m) => m.SetupComponent),
      },
      {
        path: ':id',
        loadComponent: () => import('./features/scorer/scorer-shell/scorer-shell.component').then((m) => m.ScorerShellComponent),
        children: [
          {
            path: '',
            pathMatch: 'full',
            title: 'Score - Run Count',
            loadComponent: () => import('./features/scorer/scoring/scoring.component').then((m) => m.ScoringComponent),
          },
          {
            path: 'scorecard',
            title: 'Scorecard - Run Count',
            loadComponent: () => import('./shared/components/scorecard/scorecard.component').then((m) => m.ScorecardComponent),
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: 'live' },
];
