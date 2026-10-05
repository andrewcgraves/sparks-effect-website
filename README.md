# sparks-effect-website

Vue (Vite) frontend for the Sparks Effect isochrone map — visualizing "splash zones" reachable by
walking, biking, transit, and driving from an imaginary transit route, talking to a Go API proxy.

## Branching and releases

One trunk: `trunk`. Branch from it, PR into it. Production is promoted in Vercel
from an existing build — see [`docs/releases.md`](docs/releases.md).

## Prerequisites

- Node.js (version pinned in [`.nvmrc`](.nvmrc); if you use [nvm](https://github.com/nvm-sh/nvm), run `nvm use`)
- `make`

## Getting started

```sh
make run
```

This installs dependencies, builds the app, and serves the production build locally (default:
http://localhost:4173).

For active development with hot module reloading instead, run the dev server:

```sh
make dev
```

## Available commands

| Command      | Description                                       |
| ------------ | -------------------------------------------------- |
| `make install` | Install dependencies                              |
| `make dev`     | Start the Vite dev server with hot module reloading |
| `make test`    | Run unit tests (Vitest)                           |
| `make lint`    | Run ESLint                                        |
| `make build`   | Type-check and build the app for production        |
| `make run`     | Build, then serve the production build locally     |
| `make dev-workflow` | Lint, test, and build — the full non-interactive check (no server started) |
| `make clean`   | Remove `node_modules` and `dist`                    |

Each target installs dependencies automatically if needed, so `make test`, `make lint`, `make build`,
and `make run` all work from a clean checkout. `make dev-workflow` is the target to run for an
end-to-end check (e.g. from an agent or pre-push hook) since it doesn't start a long-running server.

## Analytics

Page views come from `<Analytics />` (`@vercel/analytics/vue`, mounted in
`src/App.vue`), which reports one per route change on its own. Our own events go
through `src/analytics/`: the `track*()` helpers hand an `AnalyticsEvent` to
whichever sink is configured — the console in dev, `vercelSink` in production
builds (see `src/main.ts`). `vercelSink` deliberately drops `page_view` so
navigations are not counted twice.

A set-password link (`/welcome/:token`, or `/set-password?token=` as the API
issues it) carries a one-time token that signs its holder in. Both page-view
paths strip it through `src/analytics/redact.ts`: the router records `/welcome`,
and `<Analytics />` is given a `beforeSend` that rewrites the URL the same way.

Collection needs Web Analytics enabled for the project in the Vercel dashboard
(Analytics → Enable), which is what serves `/_vercel/insights/*`.

Custom events (`track()`) are a Pro/Enterprise feature. On a Hobby project, set
`VITE_VERCEL_CUSTOM_EVENTS=off` so `vercelSink` stops them locally instead of
posting to an endpoint that will not keep them; page views are unaffected.

## Error reports

Errors go to Grafana Cloud Frontend Observability through the Faro Web SDK
(`src/errorReporting/`, SPA-380), next to the API's error reports. Like
analytics, this only switches on in a production build, and only when
`VITE_FARO_URL` is set. Dev keeps errors in the console.

What is reported:

- any error a Vue component throws (`app.config.errorHandler`), and any uncaught
  error or unhandled rejection (Faro's own instrumentation);
- every 5xx the API answers, from `apiRequest`, tagged with the `trace_id` it
  sent as `X-Trace-Id`. Search the API's reports and the worker's logs for that
  id. A 4xx is an answer, not a fault, and is not reported.

Each report carries the route pattern (`/scenario/:slug`, never the path), the
release (the short commit SHA, `__BUILD_VERSION__`) and an environment.
Staging and production serve one and the same build (`docs/releases.md`), so
the environment is decided in the browser: `production` on `sparks-effect.app`
and `www.sparks-effect.app`, `staging` anywhere else.

Nothing leaves without passing `scrubItem` (`src/errorReporting/scrub.ts`), the
`beforeSend` hook. It walks every string in the item and removes bearer tokens,
the session token held in `sparks-effect.auth`, `token=` query values,
`/welcome/<token>` links and the `/api/auth/tokens/<token>` path. It also blanks any field whose name contains
`password`, `token`, `authorization`, `cookie` or `secret`. Console capture and
performance timings are off.

### Source maps

Stack traces are de-minified in Grafana from source maps uploaded at build time
by `@grafana/faro-rollup-plugin`. They are built `hidden`, so no bundle points
to one. They are uploaded, then deleted from `dist/` even if the upload failed,
so none is ever served. With the upload variables unset, no source maps are
built at all.

### Configuration

Set in Vercel for the Production environment, which `trunk` (staging) is built
with as well. Values come from the app's page in Frontend Observability:

| Variable | Where it is used |
|---|---|
| `VITE_FARO_URL` | the collector URL, in the browser |
| `FARO_SOURCEMAP_ENDPOINT` | build only: Settings → Source Maps → Configure source map uploads |
| `FARO_SOURCEMAP_API_KEY` | build only: an access policy token with `sourcemaps:write` |
| `FARO_APP_ID`, `FARO_STACK_ID` | build only: same page |

The collector's host (`faro-collector-*.grafana.net`) is a new outbound
destination for the Content Security Policy (SPA-425) to allow.

## Project structure

- `src/` — Vue application source
- `.github/workflows/ci.yml` — CI: lint + test on every push/PR, then build and upload the `dist`
  artifact
