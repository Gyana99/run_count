import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

/** Adds the login token to API calls. An expired token sends you back to the login page. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isLoginCall = req.url.startsWith(`${environment.apiUrl}/auth/login`) || req.url.startsWith(`${environment.apiUrl}/auth/register`);
  const withToken =
    auth.token && req.url.startsWith(`${environment.apiUrl}/`) ? req.clone({ setHeaders: { Authorization: `Bearer ${auth.token}` } }) : req;
  return next(withToken).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && auth.token && !isLoginCall) {
        auth.logout();
        router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => e);
    }),
  );
};
