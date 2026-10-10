# Route builder — plan

Date: 2026-10-10. Supersedes the 2026-10-07 brainstorm. Decisions made with the owner on
2026-10-09; measurements from the rail-data spike (see `rail-data-spike.md`).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| 1 | Ships after the 21 Oct go-live; no launch gate | Curated routes cover launch |
| 2 | Geometry edits are **refused** while a route is in use; name/details edits allowed | Stop coordinates and chainages are snapped at write time and would go stale. Invalidation is a later design |
| 3 | **Easy mode** = click along the line, each point snaps to the nearest OSM railway and the real track is filled in between consecutive clicks. **Advanced mode** = the same editor with free points (Shift), drag, midpoint insert, delete, import, simplify. One editor, two configurations | Authors wanted control over the path, not shortest-path between two stations |
| 4 | Existing, `construction` and `proposed` railways all count, styled differently | The headline corridors (CAHSR, Brightline West) are construction/proposed in OSM |
| 5 | No railway where the author clicks → the point is placed free, flagged, and the editor nudges toward advanced mode | Owner's call |
| 6 | Rail data is **our own PMTiles** built weekly from Geofabrik; the website reads it straight from object storage / nginx, never through the API | The basemap's tiles drop construction/proposed and merge ways; Overpass is not a product dependency |
| 7 | Geography is a config list of Geofabrik regions, starting `california, nevada`; nothing in code assumes a region | US-wide later |
| 8 | Everything snapping-related runs in the browser; the API only validates and stores | Responsiveness; the API stays geometry-agnostic |
| 9 | Vertex-dense traced track is **simplified on save** (Douglas–Peucker, 10 m) by default; advanced mode can turn it off | Physics splits a span per vertex |
| 10 | Builder never writes `segments[]`; routes are tangent/level with the honest caption | Re-vertexing would desync physics; curve estimation revisited later |

## What is already true (verified 2026-10-10)

- API: owned-route CRUD at `/api/me/routes` (SPA-259); slug minted from name; ingest is a flat `{type:"LineString", coordinates, properties{…}}`, unknown fields rejected; `GET /api/routes/{slug}` and snap-stops serve an owned route to its owner; services may reference the caller's own routes.
- API (SPA-481, branch pushed): owner reads carry `id`, `length_m`, `dependents{services,user_services,segments}`; `PUT` answers 409 `route_in_use` when coordinates/segments change under dependents; migration 00037 indexes `services.route_id`.
- Website: MapLibre module system (`MapModule`, `layerStack`), click-to-place + hand-rolled drag, `chainage.ts` projection maths, per-user draft persistence. Picker was curated-only; `useRouteLayer.sync` never redrew geometry (fixed in SPA-407 branch).
- Rail data (measured): CA+NV = 38,054 rail ways / 449k vertices → 20 MB GeoJSONL → **11.6 MB PMTiles z4–14**; NV alone 1.5 MB; US projected ~140 MB. CAHSR = 484 `construction`+`construction=rail` ways (with `maxspeed`) + 732 `proposed`; Brightline West = 243 `construction` ways. `tippecanoe --use-attribute-for-id=@id` keeps the OSM way id as the MVT feature id. Ways share junction node coordinates exactly, so pieces stitch by coordinate equality.
- OpenFreeMap tiles (basemap): no `construction`/`proposed`, lines merged, no names → unusable as the rail source.
- terra-draw 1.37 + maplibre adapter 1.5: `snapping.toCustom(event, ctx) → Position|undefined` on line-string and select modes; midpoints, draggable, deletable; `prefixId`, `renderBelowLayerId`; peer `maplibre-gl >=4`; 49 KB gz total.

## Architecture

```text
Geofabrik PBFs (region list)                      browser
  └─ weekly job: osmium tags-filter               RouteBuilderView
       → osmium export geojsonseq                   useRouteDraft (name, mode, coordinates, in-use)
       → tippecanoe → rail-<date>.pmtiles           useRailOverlay   (MapModule: PMTiles source + 3 styles)
  └─ nginx/R2 serves it with Range + CORS           useRouteEditor   (MapModule: terra-draw, snap, fill)
                                                      railGraph.ts   (pure: tiles → graph, nearest segment, walk)
API: /api/me/routes  ← validated LineString only
```

`railGraph.ts` is the heart and is pure TypeScript: given a bbox it fetches the z14 PMTiles tiles
(`pmtiles` + `@mapbox/vector-tile`), builds an undirected graph keyed by exact coordinates, and
answers `nearestPoint(p)` and `walk(a, b)` (Dijkstra, bounded by distance). terra-draw's
line-string mode never draws the route itself: it only starts lines of its own and resets when
one it is drawing is rewritten, so `useRouteEditor` takes each click through the mode's
`pointerEvents.leftClick` gate (answering `false`), snaps it with the same `nearestPoint` that
backs the `toCustom` hover guide, and in easy mode appends `walk(prev, clicked)` to one committed
feature with `updateFeatureGeometry` (a lone first point is shown as a point feature); a failed
walk inserts the straight span and flags it. Advanced mode keeps the same snap but lets Shift
bypass it, appends straight spans, and exposes terra-draw's select mode (drag, midpoint, delete).
Because OSM maps each track of double track as its own way, the graph links every node to the
nearest point of any other way running parallel within 8 m (at the real distance across, so a
walk crosses only where it must), and an easy-mode click tries the nearest point of each of the
three nearest ways (`nearestPoints`) in turn, keeping the first that `walk` can reach.

## Phases (dependency order, all post-launch)

### 1. Storage, list, picker — SPA-407 (website) + SPA-481 (API) — *in progress on branches*
Builder page with GeoJSON import/paste as the geometry input; "My routes" list with length and
"Used by N lines"; picker groups "Your routes" / "Curated routes" + "Draw a new route…" round
trip; geometry controls disabled when in use; redraw fix.

### 2. Rail tiles — new Ops ticket (kustomize-config) — *needs owner's hosting call*
CronJob (weekly, after the Valhalla PBF refresh) running osmium → tippecanoe over the configured
region list, writing `rail-<YYYYMMDD>.pmtiles` + a `latest` pointer to a PVC served by nginx
with `Accept-Ranges`, CORS `Access-Control-Allow-Headers: Range, If-Match` and `Expose-Headers:
ETag, Content-Range`, long `max-age`. Alternative: upload to Cloudflare R2 (free tier covers
this at $0). Either way the website gets `VITE_RAIL_TILES_URL` and the origin goes into CSP
`connect-src` (`vercel.json`, `securityHeaders.spec.ts`). Tooling: `osmium-tool` (apt) +
`tippecanoe` (pip wheel 2.72); the valhalla-scripted image has neither, so this is its own image.

### 3. Editor — SPA-90 (website)
`useRailOverlay` (PMTiles protocol, three line styles for existing/construction/proposed, lazy with
the builder route), `railGraph.ts`, `useRouteEditor` on terra-draw with easy/advanced modes,
simplify-on-save, the no-railway flag, "snapped to <name>" tooltip. Import/paste from phase 1
stays as the advanced-mode input. Dev runs against the spike's `rail-ca-nv.pmtiles` served locally.

### 4. Later
- Geometry-change invalidation: route `updated_at` recorded on the service at snap time; compile
  marks stale when the route is newer; editor offers "re-snap stops".
- `max_speed_kmh` per segment from OSM `maxspeed` (SPA-64's idea) once traced spans carry provenance.
- Curve-radius estimation gated on vertex density; grade needs a DEM (out of scope).
- Admin "Routes" tab reusing the builder against `/api/admin/routes`.

## Tickets

| Ticket | Repo | State |
| --- | --- | --- |
| SPA-481 dependents + refuse in-use geometry edits | api | branch pushed, reviewed; PR to open |
| SPA-407 storage/list/picker (+ redraw fix) | website | in progress |
| SPA-90 editor (rewrite as Change: easy/advanced modes, terra-draw, railGraph) | website | to rewrite |
| NEW Ops: weekly rail PMTiles job + hosting | kustomize-config | to file after hosting call |
| NEW Change: rail overlay + CSP + `VITE_RAIL_TILES_URL` | website | to file (can fold into SPA-90) |
| SPA-123 | — | close as duplicate of SPA-407 |
| SPA-419 attribution | — | add OSM "produced work" note for traced routes; no OpenRailwayMap needed |
