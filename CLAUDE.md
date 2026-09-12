# CLAUDE.md

Use the Makefile for all build/test tasks (npm project).

- `make dev-workflow` — run before pushing: lint, test, build (non-interactive, no server)
- `make dev` — `npm run dev` (long-running Vite dev server with hot reload; avoid in automation)
- `make build` — `npm run build` (output in `dist/`)
- `make run` — build then `npm run preview` (long-running server; avoid in automation)
- `make test` — `npm run test`
- `make lint` — `npm run lint`
- `make clean` — remove `node_modules` and `dist`

Deps install automatically via `make install`; targets depend on it.

## Domain vocabulary

[`CONTEXT.md`](CONTEXT.md) defines this repository's own words — splash zone, and
the time-remaining graph's view / row / lane / through / fork. Shared domain
vocabulary (scenario, service, station, node, edge, dwell, boarding wait, mode vs
costing, the error codes, the job statuses) is defined once in
[sparks-effect-api's `CONTEXT.md`](https://github.com/andrewcgraves/sparks-effect-api/blob/main/CONTEXT.md),
and chain vocabulary in
[sparks-effect-routing-worker's](https://github.com/andrewcgraves/sparks-effect-routing-worker/blob/main/CONTEXT.md).
Use those words; do not mint synonyms.

Declaration-level comments were deliberately removed from this source in SPA-307
because they restated their declarations. Domain meaning belongs in `CONTEXT.md`;
rationale belongs in in-function comments and the README. Do not reintroduce
comments that only repeat a declaration.

## Issues

Issues live in Linear, team `Sparks Effect` (`SPA-` prefix). Commits and PR titles
must include the identifier in the subject, e.g. `SPA-84: add authoring API client, domain types, and job-polling helper`.

## Branching

One trunk: `trunk`. Branch from it, PR into it. No `prd` branch here —
production is promoted by pushing a `vX.Y.Z` tag on a commit that is already on
`trunk`, which promotes the Vercel build that commit already produced. See
`docs/releases.md`.
