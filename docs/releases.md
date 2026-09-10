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
| `LINEAR_ACCESS_KEY_PRODUCTION` | secret | Access key for the **Website Build Production** Linear release pipeline. Lives on this environment so only a promotion can write a production release. |

And at the repository level (Settings → Secrets and variables → Actions), not
on the `production` environment — staging records every trunk CI run:

| name | kind | what it is |
| --- | --- | --- |
| `LINEAR_ACCESS_KEY_STAGING` | secret | Access key for the **Website Build Staging** Linear release pipeline. |

Adding required reviewers to that `production` environment is what puts a human
approval in front of a promotion, if that is wanted later.

Without either Linear key the matching sync step is skipped rather than failed,
so a missing pipeline does not block CI or a promotion.

## Linear

Linear Releases answer "which issues are on staging, and which made it to
production?" — not by reading a branch, but by scanning the commits this repo
already ships.

Two **continuous** pipelines, not one pipeline with stages. Staging auto-deploys
every commit on `trunk` while production lags on a tagged SHA, so the two
environments hold different commits at the same time. Linear's rule for that
shape is two pipelines:

| Pipeline | Created when | Version |
| --- | --- | --- |
| Website Build Staging | `trunk` CI goes green | short SHA |
| Website Build Production | a `vMAJOR.MINOR.PATCH` tag promotes that Vercel deployment | the git tag |

The action scans commits since the last release in **that** pipeline, pulls
`SPA-123` identifiers out of subjects and squash messages (`SPA-258: … (#69)`),
and attaches those issues to the new release. An issue that merged to `trunk`
shows up on Website Build Staging immediately; it only appears on Website Build
Production when a tag that contains it is promoted.

Create both pipelines in Linear (Settings → Releases) as **continuous**,
generate an access key per pipeline, and paste them into the secrets in the
table above. Do not use a personal API key. The action is bound to whichever
pipeline issued the key.

The first sync in each pipeline only sees the current commit — there is no
previous SHA to bound the range from.

To backfill an already-promoted tag, re-run **Release** (*Run workflow*) with
that tag and `base_ref` set to the previous release tag. Linear scans
`<base_ref>..HEAD` exclusively, so `v0.2.0` with `base_ref=v0.1.0` attaches
every `SPA-` issue in that range rather than only HEAD. A rollback
(re-promoting an older tag) does not rewrite Linear history: the original
production release stays as the one that first shipped those issues.
