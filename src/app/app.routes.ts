import { Routes } from '@angular/router';
import { matchGuard, setupGuard } from './match.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'New match - Run Count',
    canActivate: [setupGuard],
    loadComponent: () => import('./setup.component').then((m) => m.SetupComponent),
  },
  {
    path: 'match',
    title: 'Score - Run Count',
    canActivate: [matchGuard],
    loadComponent: () => import('./scoring.component').then((m) => m.ScoringComponent),
  },
  {
    path: 'scorecard',
    title: 'Scorecard - Run Count',
    canActivate: [matchGuard],
    loadComponent: () => import('./scorecard.component').then((m) => m.ScorecardComponent),
  },
  {
    path: 'rules',
    title: 'ICC rules - Run Count',
    loadComponent: () => import('./rules.component').then((m) => m.RulesComponent),
  },
  { path: '**', redirectTo: '' },
];
