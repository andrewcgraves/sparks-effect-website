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

Collection needs Web Analytics enabled for the project in the Vercel dashboard
(Analytics → Enable), which is what serves `/_vercel/insights/*`.

Custom events (`track()`) are a Pro/Enterprise feature. On a Hobby project, set
`VITE_VERCEL_CUSTOM_EVENTS=off` so `vercelSink` stops them locally instead of
posting to an endpoint that will not keep them; page views are unaffected.

## Project structure

- `src/` — Vue application source
- `.github/workflows/ci.yml` — CI: lint + test on every push/PR, then build and upload the `dist`
  artifact
