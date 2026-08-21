# Branching and releases

One trunk: `main`.

- Branch from `main`. Open the pull request into `main`. Merge on green CI.
- No direct pushes to `main`.
- Staging follows `main` automatically. Production runs a build that someone
  promoted — never a branch merge, and never a rebuild.

## Releasing

Vercel builds every commit: a preview per pull request, and `main` as staging.

Production is reached with Vercel's **Promote to Production**, which re-serves
an existing deployment's build rather than making a new one. Instant Rollback
reverses it. There is no `prd` branch — Vercel already tracks which build is
production.

CI here is a gate, not a deploy: lint, tests, build. Vercel does the building
that ships.

Production Branch and preview environment variables are not confirmed yet —
SPA-252 / SPA-253.
