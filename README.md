# Run Count (Angular 18 + Node.js + MySQL)

Cricket scorer with ICC rules (T20, ODI, Test, custom overs).

- **Scorers** log in, start a match and score ball by ball. Every change is saved to the database.
- **Viewers** need no login. They open the match list, pick a match and watch the score,
  the over, the batters and the full scorecard update live.

## Project layout

Two separate projects, each with its own `package.json` and `node_modules`:

- `frontend/` is the Angular 18 app (port 4200 in development)
- `backend/` is the Express.js REST API with MySQL (port 3000)

## Run it

You need Node.js 18+ and a running MySQL 8 (or MariaDB 10.5+) server.

    cd frontend
    npm install
    npm start            # starts the backend API (:3000) for you, then Angular on http://localhost:4200

`npm start` in `frontend/` runs `scripts/start.js`. It starts the Express API from `../backend` (installing its
packages on the first run), then `ng serve`. Output is prefixed `[api]` and `[web]`. Ctrl+C stops both.
If the API is already running on port 3000 it is left alone. Use `npm run start:web` (or `npx ng s`) for
Angular only.

Before the first run, copy `backend/.env.example` to `backend/.env` and set `DB_USER` / `DB_PASSWORD`.
The backend creates the MySQL database and tables itself.

Run the backend on its own:

    cd backend && npm start          # Express API on :3000

1. Open http://localhost:4200 and choose **Scorer log in**, then **Create account**.
2. **Score a match** > **New match**. After the match starts, **Copy viewer link** gives viewers the address.
3. Viewers open that link (or the **Matches** tab) in any browser, no account needed.

Other commands (from the root):

    npm run start:prod   # builds frontend, then the backend serves app and API on :3000
    npm test             # Angular tests (Karma, needs Chrome) and API tests (wipes TEST_DB_NAME)

## API address (Angular environments)

The frontend reads where the API lives from `frontend/src/environments/`:

| File                     | Used by                                   | `apiUrl`                      |
| ------------------------ | ----------------------------------------- | ----------------------------- |
| `environment.ts`         | `ng serve`, `ng test`, development builds | `http://localhost:3000/api`   |
| `environment.prod.ts`    | `ng build` (production, the default)      | `/api` (same domain as the app) |

`angular.json` swaps `environment.ts` for `environment.prod.ts` in production builds (`fileReplacements`).
Every HTTP call and the live stream in `core/services/api.service.ts` start from `environment.apiUrl`.
If the API runs on another domain in production, set `apiUrl` to its full address (for example
`https://api.your-domain.com/api`) and add the app's address to `CORS_ORIGINS` in `backend/.env`.

## Settings (`backend/.env`)

| Variable              | Default          | Meaning                                                 |
| --------------------- | ---------------- | ------------------------------------------------------- |
| `PORT`                | `3000`           | Port to listen on                                       |
| `DB_HOST` / `DB_PORT` | `127.0.0.1:3306` | MySQL server                                            |
| `DB_USER` / `DB_PASSWORD` | `root` / empty | MySQL account (needs CREATE rights on first start)  |
| `DB_NAME`             | `runcount`       | Database. Created if missing                            |
| `TEST_DB_NAME`        | `runcount_test`  | Used by `npm run test:server`. **Wiped on every run**   |
| `JWT_SECRET`          | made on first start | Stored in `backend/data/.jwt-secret` if not set     |
| `JWT_EXPIRES_IN`      | `7d`             | Login lifetime                                          |
| `ALLOW_REGISTRATION`  | `true`           | Set to `false` once your scorers have accounts          |
| `CORS_ORIGINS`        | `http://localhost:4200` | Comma-separated addresses of the Angular app allowed to call the API |

## Before putting it on the internet

- Set `ALLOW_REGISTRATION=false` after creating the scorer accounts, or anyone can make one.
- Serve it over HTTPS. The login token is kept in the browser's localStorage and sent as a bearer token.
- The login rate limit is per IP and held in memory. Behind a reverse proxy every user shares the proxy's IP;
  set Express `trust proxy` if you need per-user limits.
- Only the scorer who started a match can change or delete it. Everyone can read matches.

## How saving works

The ICC rules engine runs in the browser (`frontend/src/app/core/engine/engine.ts`). After every ball, undo or other action, the whole
match is saved with `PUT /api/matches/:id`. Each save carries the version the browser last saw. If the server has a
newer version (the same match open on another device) the save is refused and the scorer is asked to reload, so two
devices can never overwrite each other. If the connection drops, the change stays on screen and is saved again
automatically. Viewers get updates through server-sent events (`GET /api/matches/:id/stream`).

## Folder layout

```
frontend/src/app/
  app.component.*  app.routes.ts  app.config.ts   root shell, routes, providers
frontend/src/environments/      environment.ts (local), environment.prod.ts (production)
  core/                                           app-wide, no UI
    models/        models.ts, api.models.ts
    services/      api.service.ts (all HTTP), auth.service.ts, match.service.ts (match being scored + saving)
    guards/        auth.guard.ts
    interceptors/  auth.interceptor.ts
    engine/        engine.ts (ICC rules) + engine.spec.ts
  shared/components/                              reusable UI
    board/  match-card/  scorecard/
  features/                                       one folder per page
    auth/login/                 /login              everyone
    live/live-list/             /live               everyone
    live/live-match/            /live/:id           everyone
    rules/                      /rules              everyone
    scorer/scorer-home/         /scorer             scorers
    scorer/setup/               /scorer/new         scorers
    scorer/scorer-shell/        /scorer/:id         match owner
    scorer/scoring/             /scorer/:id         match owner
                                /scorer/:id/scorecard uses shared/components/scorecard

backend/                      Node.js + Express + MySQL (own package.json)
  .env.example
  src/
    server.js                 start-up
    app.js                    wires everything together (createApp)
    config/env.js             settings from .env
    db/                       pool.js (mysql2 pool), schema.sql, migrate.js
    routes/                   index.js, auth.routes.js, match.routes.js
    controllers/              auth.controller.js, match.controller.js (HTTP in/out)
    services/                 auth.service.js (bcrypt, JWT), match.service.js, stream.service.js (live SSE)
    repositories/             user.repository.js, match.repository.js (all SQL)
    validators/               auth.validator.js, match.validator.js
    middleware/               auth, CORS, rate limit, security headers, errors
    utils/http.js
  test/api.test.js
```

Every component keeps its own `.ts`, `.html` and `.scss` in its folder. Shared styles are in `frontend/src/styles.scss`.

Tables (`backend/src/db/schema.sql`): `users` and `matches`. The full match is stored as JSON in `state_json`,
with title, venue, date, format, status and result also kept in their own columns for the match list.
