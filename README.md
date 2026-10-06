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

## Security headers

`vercel.json` sends these on every path (`/(.*)`), beside the `Cache-Control`
rules — different keys, so the rules compose rather than compete:

- `Content-Security-Policy-Report-Only` — scripts only from this origin, no
  inline or `eval`; styles may be inline (Tailwind, Vue `:style`, MapLibre);
  `connect-src` names the API (staging and production Railway hosts), the tile
  hosts (OpenFreeMap, and Stadia when `VITE_STADIA_API_KEY` is set) and the
  geocoder (Nominatim); `worker-src 'self'` for MapLibre's worker, which
  `MapView.vue` loads from `/assets/`; `img-src data: blob:` for MapLibre's
  control icons and images.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `Permissions-Policy` — geolocation for this origin only ("use my location"),
  no camera or microphone.
- `X-Frame-Options: DENY`. `frame-ancestors 'none'` is in the CSP too, but a
  Report-Only policy ignores it, so this is what stops framing today.

The CSP only reports for now. Watch staging (`dev.sparks-effect.app`) for a
week: open DevTools' console on the map, a service page, authoring and
sign-in, and look for `[Report Only]` violations. `curl -sI
https://dev.sparks-effect.app/` and a `/scenario/<slug>` page (served by
`middleware.ts`) should both show the headers. There is no error tracker yet,
so no `report-uri`. Violations naming `vercel.live` on staging are the Vercel
Toolbar on a preview deployment, not the site.

After a clean week, enforce it: rename the key to `Content-Security-Policy` in
`vercel.json` and in `src/securityHeaders.spec.ts`. That spec fails CI when a
tile host or the geocoder changes without the CSP following; the API hosts come
from Vercel's `VITE_API_BASE_URL` and are not checked, so change them by hand.
Hosts still to add when they land: the geocoder that replaces Nominatim
(SPA-370) and the error tracker's ingest host, plus its `report-uri`
(SPA-380). An embeddable map for other sites (SPA-462) will need its own
carve-out from `frame-ancestors` and `X-Frame-Options`.

## Project structure

- `middleware.ts` — Vercel Routing Middleware for link previews (above)
- `src/` — Vue application source
- `.github/workflows/ci.yml` — CI: a production-dependency `npm audit`, lint + test on every push/PR, then build and upload the `dist`
  artifact
