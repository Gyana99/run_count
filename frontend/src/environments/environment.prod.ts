/**
 * PRODUCTION settings.
 * Swapped in for environment.ts by `ng build` (production is the default build configuration).
 */
export const environment = {
  production: true,

  /**
   * Where the Express API lives (no trailing slash).
   * - '/api' when the backend serves the built app on the same domain (npm run start:prod).
   * - A full URL such as 'https://api.your-domain.com/api' when the API is on another domain.
   *   Then also add your site's address to CORS_ORIGINS in backend/.env.
   */
  apiUrl: '/api',
};
