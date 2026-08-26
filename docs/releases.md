# Branching and releases

One trunk: `trunk`.

- Branch from `trunk`. Open the pull request into `trunk`. Merge on green CI.
- No direct pushes to `trunk`.
- Staging follows `trunk` automatically. Production runs a build that someone
  tagged — never a branch merge, and never a rebuild.

## Builds

Vercel builds every commit: a preview per pull request, and `trunk` as staging.
CI here is a gate, not a deploy: lint, typecheck, tests, build. Vercel does the
building that ships.

## Releasing

A release is a tag. Tag a commit that is already on `trunk`:

```sh
git fetch origin trunk
git tag -a v1.4.0 -m "v1.4.0" origin/trunk   # or an older SHA on trunk
git push origin v1.4.0
```

That fires the **Release** workflow, which finds the deployment Vercel already
built from that commit and promotes it — pointing the production domains at
that existing build rather than making a new one.

The workflow refuses to promote:

- a tag that is not `vMAJOR.MINOR.PATCH`
- a tag pointing at a commit that is not an ancestor of `trunk` — this is what
  stops a feature branch reaching production
- a commit Vercel has no ready deployment for — i.e. one staging never served

### Rolling back

Re-promote an earlier tag: Actions → **Release** → *Run workflow*, pass the tag
(`v1.3.0`). Vercel's Instant Rollback in the dashboard does the same thing; the
workflow is the version that leaves a record of which commit was chosen.

## What has to be configured outside the repo

In the Vercel project:

- `trunk` must **not** be the Production Branch. If it is, every merge ships to
  production behind the workflow's back, which is the thing this setup exists to
  prevent. Point production at a branch nobody pushes, and give `trunk` the
  staging domain — production then only ever moves by promotion.
- `trunk`'s deployments should be built with the same environment variables
  production uses. Vercel rebuilds on promotion when a deployment was built for
  a different environment, and a rebuild is no longer the artifact staging ran.

GitHub side, on a repository environment named `production` (Settings →
Environments), so the credential is scoped to releases rather than to every
workflow run:

| name | kind | what it is |
| --- | --- | --- |
| `VERCEL_TOKEN` | secret | Vercel access token with deploy rights on this project. |
| `VERCEL_ORG_ID` | secret | The project's owner id — `vercel link` writes it to `.vercel/project.json` as `orgId`, or Vercel → Settings → General. |
| `VERCEL_PROJECT_ID` | secret | Same file, `projectId`. |

Adding required reviewers to that `production` environment is what puts a human
approval in front of a promotion, if that is wanted later.
