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

## Agent skills

### Issue tracker

Issues live in Linear, team `Sparks Effect` (`SPA-` prefix). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

## Branching

One trunk: `trunk`. Branch from it, PR into it. No `prd` branch here —
production is promoted by pushing a `vX.Y.Z` tag on a commit that is already on
`trunk`, which promotes the Vercel build that commit already produced. See
`docs/releases.md`.
