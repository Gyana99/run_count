# Run Count (Angular 18, SCSS, routing)

Cricket scorer with ICC rules: T20, ODI, Test and custom overs.

    npm install
    ng serve        # http://localhost:4200
    ng build
    ng test         # Karma + Jasmine (needs Chrome)

## Pages (src/app/app.routes.ts)

| Route        | Page                                         |
| ------------ | -------------------------------------------- |
| `/`          | New match setup (redirects to /match if one is running) |
| `/match`     | Live scoring                                 |
| `/scorecard` | Batting and bowling cards, fall of wickets   |
| `/rules`     | ICC rules built into the scorer              |

`/match` and `/scorecard` send you back to `/` when there is no match
(see `match.guard.ts`). The match is saved in localStorage, so a refresh keeps it.

The rules engine is plain TypeScript in `engine.ts` (with `engine.spec.ts`).
