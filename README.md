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

## Link previews

Link-unfurl crawlers (Slackbot, Discordbot, iMessage, …) run no JavaScript, so a
shared link's title and description have to be in the HTML. `middleware.ts` is
Vercel Routing Middleware for the public pages only — `/`, `/scenario/:slug`,
`/services/:slug`, `/routes/:slug`. It fetches the deployment's own
`/index.html` and the page's public read (both within 1.5 s, side by side), and
splices that page's `<title>`, `description`, `og:*` and `twitter:card` tags
into the head. The tag building lives in `src/share/linkPreview.ts`.

- `og:url` comes from the request's host, never the build, so a build promoted
  from staging names production.
- A failed or slow read, a 404 and an unpublished service all give the
  site-wide card, the same one the built `index.html` carries for every other
  page. Nothing tells "unpublished" apart from "never existed".
- The middleware reads `VITE_API_BASE_URL` at runtime, so the variable must be
  set for the deployment's runtime as well as its build.
- On a deployment behind Deployment Protection the shell fetch gets a 401 and
  the middleware steps aside: the page loads as built, with the default card.
  Check a real unfurl on staging, not on a pull-request preview.

## Project structure

- `middleware.ts` — Vercel Routing Middleware for link previews (above)
- `src/` — Vue application source
- `.github/workflows/ci.yml` — CI: a production-dependency `npm audit`, lint + test on every push/PR, then build and upload the `dist`
  artifact
