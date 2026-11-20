/**
 * LOCAL / development settings.
 * Used by `ng serve`, `ng build --configuration development` and `ng test`.
 */
export const environment = {
  production: false,

  /** Where the Express API lives. Every HTTP call and live stream starts from here (no trailing slash). */
  apiUrl: 'http://localhost:3000/api',
};
