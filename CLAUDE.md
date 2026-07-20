# CLAUDE.md

Use the Makefile for all build/test tasks (npm project).

- `make dev-workflow` — run before pushing: lint, test, build (non-interactive, no server)
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
