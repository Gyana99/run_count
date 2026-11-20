import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatchService } from './match.service';

/** Score and Scorecard pages need a match; otherwise go to the setup page. */
export const matchGuard: CanActivateFn = () => {
  const svc = inject(MatchService);
  return svc.state() ? true : inject(Router).createUrlTree(['/']);
};

/** The setup page is only for starting a match; a running match goes to the scorer. */
export const setupGuard: CanActivateFn = () => {
  const svc = inject(MatchService);
  return svc.state() ? inject(Router).createUrlTree(['/match']) : true;
};
