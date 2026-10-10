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

`package.json`'s `overrides` points `@vercel/analytics`'s optional `vue-router`
peer at our own `vue-router`. Released `@vercel/analytics` (2.0.1) still peers
`vue-router@^4`, and the `npm install` Vercel's build runs refuses the conflict
with ERESOLVE once we are on vue-router 5 (SPA-472). The component only calls
`useRoute()`, which vue-router 5 keeps. Drop the override once a stable
`@vercel/analytics` accepts `^5` (its canaries already do).

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

The collector's host, `https://faro-collector-prod-us-west-0.grafana.net` for
this stack, is in `connect-src` of `vercel.json`'s Content Security Policy.

## Address search

The address box and "use my location" geocode with
[Stadia Maps Geocoding v2](https://docs.stadiamaps.com/geocoding-search-autocomplete/),
called straight from the browser (SPA-369 chose it; Stadia's terms forbid
proxying or caching it). `src/api/geocoding.ts` is the only module that knows
the provider:

- `fetchSuggestions` calls `/autocomplete`, limited to the US and a
  California–Nevada box. Its matches carry no coordinates, so `lookupPlace`
  calls `/place_details` for the one the user picks.
- `reverseGeocode` calls `/reverse` for "use my location". A failure returns
  `null`, and the form keeps the coordinates without a name.
- Any failure (an HTTP error, a 429, the free quota running out, a network
  error or a malformed body) throws `GeocoderUnavailableError`, and the box
  says "Address search is unavailable. Click the map to choose a point."
  instead of "No results found".
- To save credits, the box waits for three characters and 300 ms of quiet,
  and aborts a search the next keystroke supersedes.

Authentication depends on the host:

| Where | How it authenticates |
|---|---|
| `sparks-effect.app`, `dev.sparks-effect.app` | Stadia **domain auth**: list both hosts under the Stadia property's Authentication Configuration. No key ships, and `VITE_STADIA_API_KEY` stays unset in Vercel's Production scope. |
| Vercel previews (`*.vercel.app`) | `VITE_STADIA_API_KEY` in Vercel's **Preview** scope only. That key is public in preview bundles; rotate it if abused. It also switches previews to Stadia tiles. |
| `localhost` | Autocomplete and place details work keyless. Reverse geocoding doesn't, so "use my location" needs `VITE_STADIA_API_KEY` in `.env.local`. |

The geocoder sends `api_key` only when that variable is set. The account is on
Stadia's free, non-commercial plan, which **stops serving** at its monthly
credit cap (autocomplete is 1 credit, place details and reverse are 20 each)
instead of billing overage, so keep a usage alert at about 70% in the Stadia
dashboard. Move to Starter if usage stays near the cap or the site starts
earning money.

Stadia's terms ask for a credit wherever its results are used; the footer's
"Search by Stadia Maps" links to its attribution page, which lists the data
sources. `api.stadiamaps.com` is in the CSP's `connect-src`.

## Legal pages

`/privacy`, `/terms` and `/attribution` (SPA-420) are static Vue views
(`src/views/PrivacyView.vue`, `TermsView.vue`, `AttributionView.vue`) on the
shared `ProsePage` shell, which dates each one. Every page holds an `UPDATED`
constant; bump it whenever that page's copy changes, since the date is the
only thing that tells a reader the text moved. The one address all three ask
people to write to is `CONTACT_EMAIL` in `src/legal/contact.ts`.

What each page says follows the code, so a change to the code is a change to
the copy:

- The privacy policy names every third party that receives data: Vercel
  (hosting, analytics), Railway (API, database), Stadia Maps (address search,
  tiles on previews), OpenFreeMap (tiles) and Grafana Cloud (error reports,
  cluster logs). Adding a processor, a custom analytics event, or anything
  kept in `localStorage` means adding it there.
- The terms link How it works and Report a problem only once those routes
  exist, the same rule as the footer.
- The attribution page carries the wording SPA-419 found each licence to
  require. Its tile credit follows `resolveTileCredit`, like the footer's. Two
  things it cannot yet state are offered on request instead: the per-build
  Geofabrik extract dates and Valhalla version (the ODbL §4.6 "method of
  making the alterations"), and the full agency list from the serving
  generation's `gtfs-manifest.csv`, which lives in the private cluster config.
  Both become static text once the API exposes generation metadata.

The map itself credits 511 ("Data provided by 511.org", which 511's agreement
wants next to the data), links `/attribution` as "Data sources" and keeps
MapLibre's own credit (`MAP_CREDITS` in `MapView.vue`). The style's TileJSON
adds the tile host, OpenMapTiles and OpenStreetMap on its own. The footer
repeats the OSM, ODbL, tile, 511 and Stadia credits on every page.

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

## Search engines

- `/robots.txt` lets crawlers in, keeps them out of `/authoring`, `/login`,
  `/account`, `/admin`, `/welcome`, `/set-password` and `/api/` (the functions
  behind these two paths), and names the sitemap.
  Its `Sitemap:` line must be absolute, and a build cannot know its host, so it
  is served by a function (`api/robots.ts`) rather than a file in `public/`.
- `/sitemap.xml` (`api/sitemap.ts`) lists `/`, every curated scenario
  (`/scenario/:slug`) and curated route (`/routes/:slug`), and every published
  service (`/services/:slug`, with `lastmod` from `published_at`), read from the
  API's public lists. The CDN keeps it for an hour. A list the API cannot answer
  in time (all reads share one 8-second deadline) is left out, or cut short, and
  the rest is kept for five minutes instead; with nothing read it is `/` alone.
  Like the middleware, it needs `VITE_API_BASE_URL` at runtime.
- `/` and every public page the middleware finds in the API carry
  `<link rel="canonical">` on the requesting host, with no query string or
  trailing slash. An unknown or unpublished slug, or a failed read, gets none.
- Every response from any host but `sparks-effect.app` (or `www.`) carries
  `X-Robots-Tag: noindex` — staging, previews, and the `vercel.app` alias of
  production alike. It is a host rule in `vercel.json`, not `VERCEL_ENV`:
  production and staging can be the very same deployment (a promotion moves
  domains, it does not rebuild — `docs/releases.md`), so the host is the only
  thing that tells them apart. Vercel adds the header to `*.vercel.app`
  previews itself, but not to a custom domain on a non-production branch, which
  is what staging is. If production's domain changes, change it there.
- Both rewrites sit ahead of the SPA catch-all in `vercel.json`, which also
  excludes the two paths, so neither can be answered with the shell.

Production's sitemap lists published services only once production's API runs
a tag that serves `/api/published-services` (SPA-358, paged by SPA-434; not in
`v0.3.0`). Until then that list is left out and the sitemap is kept for five
minutes; check `/sitemap.xml` after promoting the API.

After a deploy, `curl -sI https://dev.sparks-effect.app/robots.txt` shows
`x-robots-tag: noindex`, and `curl -sI https://sparks-effect.app/` does not.

Once production serves this, submit `https://sparks-effect.app/sitemap.xml` in
Google Search Console (and Bing Webmaster Tools, if wanted). That is a manual,
one-time step; nothing here does it.

## Security headers

`vercel.json` sends these on every path (`/(.*)`), beside the `Cache-Control`
rules — different keys, so the rules compose rather than compete:

- `Content-Security-Policy-Report-Only` — scripts only from this origin, no
  inline or `eval`; styles may be inline (Tailwind, Vue `:style`, MapLibre);
  `connect-src` names the API (staging and production Railway hosts), the tile
  hosts (OpenFreeMap, and Stadia when `VITE_STADIA_API_KEY` is set) and the
  geocoder (Stadia, `api.stadiamaps.com`); `worker-src 'self'` for MapLibre's worker, which
  `MapView.vue` loads from `/assets/`; `img-src data: blob:` for MapLibre's
  control icons and images.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and
  `Permissions-Policy` — geolocation for this origin only ("use my location"),
  no camera or microphone.
- `X-Frame-Options: DENY`. `frame-ancestors 'none'` is in the CSP too, but a
  Report-Only policy enforces nothing, `frame-ancestors` included, so this is
  what stops framing today.

The pages `middleware.ts` answers are responses it builds itself, and Vercel
may not apply `vercel.json`'s headers to those. So the middleware copies the
security headers (and only those — not the shell's caching) from the
`/index.html` shell it already fetches, which is an ordinary static hit that
carries them. `vercel.json` stays their one source; `src/securityHeaders.ts`
holds the list of keys copied, and its spec fails if the catch-all rule gains
a header the list lacks.

The CSP only reports for now, and no reports are collected: there is no
`report-uri` until the error tracker lands (SPA-380). So the watch week means
opening DevTools' console on staging (`dev.sparks-effect.app`) and looking for
`[Report Only]` violations across the main pages: `/`, a `/scenario/<slug>`, a
`/services/<slug>`, a `/routes/<slug>`, the authoring pages, login, an address
search, and "use my location". `curl -sI https://dev.sparks-effect.app/` and a
`/scenario/<slug>` page (served by `middleware.ts`) should both show the
headers.

Staging and pull-request previews are preview deployments, so the Vercel
Toolbar loads there, and its requests (`vercel.live` and the like) will be
blocked once the CSP is enforced. Before the watch week, turn the Toolbar off
for preview deployments in the Vercel project settings, rather than
allowlisting `vercel.live` in `vercel.json`: that file cannot vary per
environment, so the allowance would ship to production on promotion.

After a clean week, enforce it: set `ENFORCING` to true in
`src/securityHeaders.spec.ts` and rename the key to `Content-Security-Policy`
in `vercel.json`. What guards the policy meanwhile:

- `src/securityHeaders.spec.ts` fails CI when the map style URL's origin or the
  geocoder changes without the CSP following. It checks the style URL's
  origin only; sprite, glyph and tile URLs inside the remote style JSON are not
  covered, so a style that moves those to another host needs a manual check.
- The API hosts come from Vercel's `VITE_API_BASE_URL`, which the repository
  cannot see. `vite.config.ts` reads `vercel.json` on a Vercel build (where
  `VERCEL` is set) and fails it when that variable's origin is not in the CSP's
  `connect-src`, so a misconfigured preview fails visibly instead of the
  enforced CSP silently blocking every API call. Local and CI builds skip it.

Hosts still to add when they land: the error tracker's ingest host, plus its
`report-uri` (SPA-380). An embeddable map for other sites (SPA-462) will need its own
carve-out from `frame-ancestors` and `X-Frame-Options`. MapLibre's RTL text
plugin, or anything loaded through `importScriptInWorkers`, would need
`script-src` changes if ever adopted.

## Project structure

- `middleware.ts` — Vercel Routing Middleware for link previews, carrying the security headers onto the pages it answers (above)
- `api/` — Vercel Functions for `/robots.txt` and `/sitemap.xml` (above)
- `src/` — Vue application source
- `.github/workflows/ci.yml` — CI: a production-dependency `npm audit`, lint + test on every push/PR, then build and upload the `dist`
  artifact
