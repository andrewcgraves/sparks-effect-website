# Spike: rail data for a snap-to-railway route editor

Date: 2026-10-10. Read-only spike; nothing in any repository was modified.

Correction to the brief: the website is on **maplibre-gl 6.13.0** (`package.json` `^6.13.0`, lockfile `6.13.0`), not 5.24. Nothing below depends on 5 vs 6 except where noted.

---

## 1. OpenFreeMap positron style

Fetched `https://tiles.openfreemap.org/styles/positron` (saved as `tmp/dl/positron.json`).

| Item | Value |
|---|---|
| Vector source | `openmaptiles`: `{type: vector, url: https://tiles.openfreemap.org/planet}` (TileJSON 3.0.0) |
| Tile URL template | `https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf` (date-stamped path; the TileJSON is re-pointed on each planet rebuild) |
| Schema | OpenMapTiles, TileJSON `version: 3.16.0`; generated with Planetiler (`planetiler-openmaptiles`) — openfreemap.org: "map schema is unmodified OpenMapTiles" |
| Zoom range | TileJSON minzoom 0, maxzoom 14; `transportation` vector layer minzoom 4, maxzoom 14 |
| Tile headers | `access-control-allow-origin: *`, `cache-control: public, max-age=315360000` (immutable by path) |
| Raster helper | `ne2_shaded` Natural Earth raster to z6 |

### Which layer carries railways

Source-layer `transportation`, attribute `class` = `rail` or `transit`, `subclass` = raw OSM `railway` value.
Style layers in positron (all `source-layer: transportation`):

| style layer | filter | minzoom |
|---|---|---|
| `railway`, `railway_dashline` | `class == rail && !has service` | 13 |
| `railway_service`, `railway_service_dashline` | `class == rail && has service` | 16 |
| `railway_transit`, `railway_transit_dashline` | `class == transit && brunnel != tunnel` | 16 |

Note: the *style* starts drawing rail at z13, but the *tiles* contain rail from much lower zoom (next table). `queryRenderedFeatures` sees only what the style draws; `querySourceFeatures` sees whatever is in the tile.

### Which OSM railway values are in the tiles, and from which zoom

Source: `planetiler-openmaptiles` `Transportation.java` (`RAILWAY_RAIL_VALUES`, `RAILWAY_TRANSIT_VALUES`, inline minzoom logic) and OpenMapTiles `mapping.yaml` / `class.sql` / `transportation.sql`:

| OSM `railway=` | class/subclass | min zoom in tile |
|---|---|---|
| `rail` with `usage=main` | rail/rail | 8 |
| `rail` (other) | rail/rail | 10 |
| `narrow_gauge` | rail/narrow_gauge | 10 |
| `light_rail` | transit/light_rail | 11 |
| `subway`, `tram`, `monorail`, `funicular`, `preserved` | transit/… or rail/… | 14 |
| any of the above with non-empty `service=*` (yard, siding, spur, crossover) | same | 14 |
| **`construction`, `proposed`, `disused`, `abandoned`** | **not imported at any zoom** | — |

`mapping.yaml` `osm_railway_linestring` imports only `rail, narrow_gauge, preserved, funicular, subway, light_rail, monorail, tram`. `railway_class()` in `class.sql` returns NULL for anything else, so construction/proposed/disused never reach a tile. The only `*_construction` classes in OpenMapTiles are **highway** construction (e.g. `secondary_construction`, seen in the decoded tiles) — not rail.

Verified empirically by decoding live tiles (`tmp/fetch_tiles.sh` → `tmp/node/decode.mjs`, Oakland z9–z14 and Fresno/Las Vegas z14):
- Fresno z14 tile `14/2740/6391` (downtown, where CAHSR CP1 is under construction) contains exactly 1 rail feature (the existing UP/BNSF line) and nothing for CAHSR.
- Las Vegas z14 `14/2950/6430` (Brightline West alignment near I-15): 0 rail features.

### Attributes present on rail features

TileJSON `transportation` fields: `access, bicycle, brunnel, class, expressway, foot, horse, indoor, layer, level, mtb_scale, network, official, oneway, ramp, service, subclass, surface, toll`.
Observed on rail features: `class, subclass, service, brunnel, layer` only. **No `name`, `maxspeed`, `usage`, `electrified`, `gauge`, `operator`.** (OpenMapTiles puts rail names in `transportation_name` only for roads; `Transportation.java` outputs none of these for rail.)

Feature ids: **present on every feature** (159/159, 123/123, … 361/361 across all decoded tiles). Planetiler's `feature_source_id_multiplier` default 10 gives `id = osm_way_id*10 + 2` (e.g. `78625990` → way 7862599). **But** `postProcess` runs `FeatureMerge.mergeLineStrings` at *every* zoom including z14: a yard in Oakland z14 came back as one feature with 82 parts / 528 points and one id, and at z9 one feature had 115 parts. So the id identifies one member way of a merged group, not the way the clicked segment belongs to. Not usable for per-way stitching; usable only as a stable-ish key within a tile.

### Usage terms (openfreemap.org, fetched 2026-10-10)

- "Is commercial usage allowed? Yes." No registration, no API keys, no cookies.
- "there are no limits on the number of map views or requests."
- Attribution required (MapLibre adds it from TileJSON `attribution`; OpenFreeMap credit optional-but-encouraged, OpenMapTiles + OSM credits mandatory).
- "At the moment, I don't offer SLA guarantees or personalized support." Funded by donations/GitHub Sponsors; weekly planet dumps (Btrfs / MBTiles) are published for self-hosting.
- Programmatic tile fetching from a product is the normal use; bulk download of tiles is the thing to avoid (use the published planet files instead).

**Conclusion for Q1:** OpenFreeMap tiles are fine as the basemap and even for snapping to *existing* rail at z14, but they cannot serve `railway=construction/proposed` (CAHSR, Brightline West) and carry no `name`/`maxspeed`. A separate rail tileset is required.

---

## 2. Vector-tile mechanics for snapping

### What MapLibre returns

MapLibre `Map` docs (`queryRenderedFeatures`, `querySourceFeatures`): "Because features come from tiled vector data … feature geometries may be split or duplicated across tile boundaries and, as a result, features may appear multiple times in query results." `querySourceFeatures` additionally: returns features "whether or not they are rendered by the current style" but "does not check tiles outside the currently visible viewport". Options: `sourceLayer`, `filter`, `validate` (and `layers` for rendered). Returned `feature.id` is the MVT feature id when the tile has one (confirmed above for OpenFreeMap; and for self-built tiles below). Geometry is in tile-clipped, screen-independent lng/lat (`feature.geometry`), but clipped to tile extent + buffer: OpenMapTiles `transportation` buffer = 4 px (of 256), tippecanoe default `-b 5`. Planetiler `VectorTile.java` encodes each feature once per tile; a line crossing the tile edge is cut to the tile+buffer and emitted again (as a separate feature with the same id) in the neighbouring tile.

Resolution: tile extent 4096 at z14 → ~2.4 m/unit at the equator, ~1.9 m at 37°N. Simplification: Planetiler default `simplify_tolerance_at_max_zoom = 256/4096 = 0.0625 px` (≈ 0.15 m at z14 — effectively none) and `0.1 px` below max zoom (`PlanetilerConfig.java`). Tippecanoe: "the standard tolerance tries to keep the line … within one tile unit" per zoom; `-pS/--simplify-only-low-zooms` keeps z14 unsimplified (what I used). So: **query at z14 tiles** (overzoomed when the map is at z15+; MapLibre reuses the z14 tile). At z13 and below the geometry is simplified and, more importantly, service tracks and most transit are absent.

### (a) Nearest rail segment to a click

1. Load the rail layer from a *separate* vector source (our PMTiles) so `querySourceFeatures({sourceLayer:'rail'})` is cheap, or use `queryRenderedFeatures(bboxAroundPoint, {layers:[railLayerIds]})` with a ~10 px box.
2. Dedupe by `feature.id` (OSM way id) — duplicates across tiles are the same way, clipped differently; keep all pieces, they are needed for (b).
3. Project click and candidate vertices with `map.project()` and run point-to-segment distance in screen px (or use `@turf/nearest-point-on-line` in lng/lat with a metric). Snap threshold ~10–15 px. Result: `{wayId, segmentIndex, snappedLngLat}`.

Caveat: `queryRenderedFeatures`/`querySourceFeatures` only know tiles currently loaded for the viewport; two clicks far apart at low zoom will not have z14 geometry loaded.

### (b) Walking the track between two clicks across tile boundaries

Option A — MapLibre query only: at z14, build an undirected graph from the deduped pieces: nodes keyed by rounded lng/lat (6 dp ≈ 0.1 m), edges = consecutive vertex pairs; OSM ways share *exact* node coordinates at junctions, so coordinate-keyed joins reconstruct topology without needing ids. Tile buffers duplicate segments near edges — dedupe edges by (coordA, coordB). Run Dijkstra/A* between the two snapped points. Works only within loaded tiles.

Option B (recommended) — bypass MapLibre's query and read the PMTiles directly: `pmtiles` npm (4.5.0, 2026-08-10, dep `fflate`) gives `new PMTiles(url).getZxy(z,x,y)` (HTTP Range reads, header+directory cached); decode with `@mapbox/vector-tile` + `pbf` (the exact libs used in this spike's decoder) and `feature.toGeoJSON(x,y,z)`. Fetch the z14 tiles covering the bbox of the two clicks (plus a margin), build the same coordinate-keyed graph, route. Independent of viewport/zoom and of what the style renders; each z14 tile in our build is small (whole Nevada rail set is 1.2 MB across all z10–14 tiles). Bound the search to e.g. 50 km / a few hundred tiles and fall back to a straight segment when exceeded.

Identifier availability for stitching:
- OpenFreeMap/OpenMapTiles: ids present but post-merge (see Q1) → not per-way. OpenMapTiles' SQL build does select `osm_id` but does not emit it as an attribute.
- Self-built with tippecanoe: GeoJSON top-level `id` is used as the MVT feature id if it is a non-negative integer; `--use-attribute-for-id=@id` takes it from a property instead (removes the property on success — `serial.cpp`; needs `-aI` if stringified). `--generate-ids` (`-ai`) invents ids "not guaranteed stable between runs" — don't use it for OSM data. Verified in `nv-rail.pmtiles`: z14 features have `id` = OSM way id and the `@id` property is gone. Tippecanoe *does* keep a split way as one feature per tile with the same id, unlike Planetiler's merge, as long as you do not pass `--coalesce`.
- Self-built with Planetiler custommap: `id:` expression per feature in the YAML; default multiplier id scheme as above; disable merging (`tile_post_process.merge_line_strings`) to keep per-way features.

---

## 3. Building our own rail tiles

### Input sizes (Geofabrik, HEAD on 2026-10-09/10)

| extract | bytes | ≈ |
|---|---|---|
| `north-america/us/california-latest.osm.pbf` | 1,331,712,493 | 1.33 GB |
| `north-america/us/nevada-latest.osm.pbf` | 123,627,199 | 124 MB |
| `north-america/us-west-latest.osm.pbf` | 3,414,638,308 | 3.4 GB |
| `north-america/us-latest.osm.pbf` | 12,196,456,372 | 12.2 GB |
| `north-america-latest.osm.pbf` | 19,488,165,082 | 19.5 GB |

### Way counts (taginfo.geofabrik.de per-region, taginfo.openstreetmap.org global; Overpass for CA+NV)

| region | rail | light_rail | subway | tram | narrow_gauge | monorail | funicular | construction | proposed | disused | total kept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| California | 25,386 | 2,987 | 1,405 | 194 | 343 | 222 | 64 | 590 | 841 | 3,004 | ~35.0k |
| Nevada | 2,797 | 22 | 0 | 1 | 8 | 40 | 27 | 28 | 2 | 93 | 3,018 (measured) |
| CA+NV (Overpass, same filter) | | | | | | | | | | | **37,998 ways / 403,721 nodes** |
| US | 403,540 | 10,429 | 13,394 | 2,227 | 1,527 | 1,106 | 178 | 1,059 | 1,132 | 31,680 | ~466k |
| world | 2,829,874 | 45,248 | 100,864 | 118,427 | 57,087 | 5,119 | 2,622 | 43,138 | 19,315 | 194,227 | ~3.4M |

(`abandoned` 132,785 US ways deliberately excluded; `construction=rail` globally 30,969 ways.)

### Measured sizes (this spike, pyosmium + tippecanoe 2.72.0 from PyPI, scripts `tmp/rail_extract.py`, `tmp/build_tiles.sh`)

Tags kept: `railway,name,maxspeed,usage,electrified,gauge,construction,construction:railway,proposed,proposed:railway,service,highspeed,operator`, id = OSM way id.

| dataset | ways | vertices | GeoJSONSeq | gz | PMTiles z4–14 | PMTiles z10–14 |
|---|---|---|---|---|---|---|
| Nevada | 3,018 | 52,144 | 2.01 MB | 0.46 MB | **1.46 MB** | 1.23 MB |
| California + Nevada | 38,054 | 449,072 | 20.3 MB | 4.1 MB | **11.6 MB** | 9.2 MB |

Ratios from CA+NV: ~533 B GeoJSON/way, ~11.8 vertices/way, **PMTiles ≈ 0.57× GeoJSONSeq, ≈ 26 B per vertex, ≈ 304 B per way** (z4–14; the z4–9 pyramid adds only ~25%).

Extrapolation to the whole US (~466k ways with the same filter, per taginfo; same per-way density as CA+NV):
- GeoJSONSeq ~250 MB (~50 MB gz), **PMTiles ~140 MB (range 120–180 MB)** for z4–14. Served via range requests this is fine: a z14 tile is a few KB; the client never downloads the file.
- Build time: CA extraction 367 s with single-threaded pyosmium over a 1.33 GB PBF (NV: 39 s); tippecanoe for CA+NV 3.4 s. osmium-tool (C++) is several times faster than pyosmium. US from the 12.2 GB PBF: osmium tags-filter ~15–30 min, export a few minutes, tippecanoe ~1–2 min. Fits in a GitHub Actions job (6 h limit) or a k8s CronJob; the 12 GB download is the slow part. Memory stays well under 2 GB on the osmium path.

### Command pipeline

```bash
# 1. filter ways (nodes are kept automatically so geometries can be built; -R would drop them)
osmium tags-filter -o rail.osm.pbf california-latest.osm.pbf nevada-latest.osm.pbf \
  w/railway=rail,light_rail,subway,tram,narrow_gauge,monorail,funicular,construction,proposed,disused
# (multiple inputs: run `osmium merge` first or run tags-filter per file then `osmium merge`)

# 2. export to GeoJSONSeq, one Feature per line, OSM id as "@id" property
cat > export.json <<'EOF'
{ "attributes": { "type": false, "id": true, "version": false, "changeset": false, "timestamp": false, "uid": false, "user": false, "way_nodes": false },
  "linear_tags": true, "area_tags": false,
  "include_tags": ["railway","name","maxspeed","usage","electrified","gauge","construction","construction:railway","proposed","proposed:railway","service","highspeed","operator"] }
EOF
osmium export -f geojsonseq -x print_record_separator=false --geometry-types=linestring -c export.json -o rail.geojsonl rail.osm.pbf

# 3. tiles (ids = OSM way ids; no merge/coalesce; z14 unsimplified)
tippecanoe -o rail.pmtiles --force -l rail -Z 4 -z 14 \
  --use-attribute-for-id=@id \
  -y railway -y name -y maxspeed -y usage -y electrified -y gauge -y construction -y construction:railway \
  -y proposed -y proposed:railway -y service -y highspeed -y operator \
  --simplify-only-low-zooms --no-feature-limit --no-tile-size-limit --read-parallel rail.geojsonl
```

Notes:
- `osmium tags-filter` expressions are OR-ed; there is no AND across keys, so you cannot say "railway=construction AND construction=rail" in one pass. Either (i) keep all `railway=construction/proposed` ways (US: 1,059 + 1,132 ways — trivial) and filter in tippecanoe with `-j '{"rail":["any",["!in","railway","construction","proposed"],["in","construction","rail","light_rail","subway","tram","narrow_gauge","monorail"],["in","construction:railway","rail","light_rail"],["in","proposed","rail","light_rail","subway","tram"],["in","proposed:railway","rail","light_rail"]]}'`, or (ii) a second `osmium tags-filter` pass on the construction subset. Keep both `construction=*` and `construction:railway=*` (lifecycle-prefix form) — Brightline West uses both (see Q6).
- `osmium export` `"id": true` emits the id as property `@id` (no top-level `id`); `-u type_id` would give `"w123"` strings which tippecanoe rejects as non-numeric ids ("Attribute … as feature ID is not a number"). Hence `--use-attribute-for-id=@id`.
- `-z 14` is enough: z15+ are overzoomed by MapLibre from z14 and z14 is unsimplified with `-pS`.
- `-Z 10` halves nothing meaningful (NV: 1.46 → 1.23 MB); keep z4+ so the rail layer can also be drawn at low zoom for the editor's overview.
- Low zooms will exceed 500 KB per tile for the whole-US file around z4–6 unless you accept dropping (`--drop-densest-as-needed`) — fine for an editor layer; or build the low-zoom pyramid from `usage=main` only via `-j` with `$zoom`.

### Tooling availability

- **kustomize-config valhalla image**: `ghcr.io/valhalla/valhalla-scripted` pinned by digest (`base/valhalla/kustomization.yaml`), runtime stage is `ubuntu:24.04` with `libluajit, libgeotiff5, libzmq, spatialite-bin, libprotobuf-lite, python3.12-minimal, python3-requests, python3-shapely, curl, unzip, moreutils, jq` (`valhalla/docker/Dockerfile-scripted`). **No osmium-tool, no tippecanoe, no Java.** The repo's `scripts/fetch-tile-pbfs.sh` only curls Geofabrik PBFs into `PBF_CACHE_DIR` and hardlinks them per generation — the cached `california-latest.osm.pbf` / `nevada-latest.osm.pbf` are on the valhalla PVC and could be re-used by a sibling Job mounting the same PVC (hostPath local-path PVs; the deployment comments say RWO is not enforced on this cluster). A rail-tile Job would need its own image (e.g. `ubuntu:24.04` + `apt-get install osmium-tool` + tippecanoe binary, or `ghcr.io/onthegomap/planetiler`).
- **GitHub Actions ubuntu-24.04**: `apt-get install osmium-tool` → **1.16.0-1build1** (Launchpad; 22.04 has 1.14.0, 26.04 has 1.19.0). Tippecanoe is **not** in Ubuntu apt. Fast options: `pip install tippecanoe` (PyPI 2.72.0, manylinux wheel — this spike used it, install ~10 s), `micromamba install -c conda-forge tippecanoe` (2.79.0), or `make -j && make install` from `felt/tippecanoe` (needs `libsqlite3-dev zlib1g-dev`, ~2–4 min on a 4-vCPU runner). Java 21 is preinstalled on runners for Planetiler.
- **Planetiler** (Java ≥21, `--output=x.pmtiles`): `planetiler-custommap` YAML with `include_when: {railway: [rail, …]}`, `attributes`, per-feature `id:` expression, `tolerance`/`tolerance_at_max_zoom`, optional `merge_line_strings`. Needs RAM ≈ 0.5× PBF (6 GB for the US file) and disk 5–10× PBF. It is a good single-tool option (one command, no GeoJSON intermediate, reads the PBF directly, can pull `geofabrik:california` itself) but: a 12 GB US PBF needs a 6–8 GB-heap runner, and the YAML profile is less expressive than tippecanoe's `-j` filters; the osmium+tippecanoe path streams and needs <1 GB RAM. For CA+NV either works; for the US I'd still pick osmium+tippecanoe.

---

## 4. Hosting the PMTiles file

Requirements (docs.protomaps.com/pmtiles/cloud-storage): HTTP `Range` support; CORS when on another origin: allow methods `GET, HEAD`, allow request headers `Range, If-Match`, expose `ETag` (plus `Accept-Ranges`/`Content-Range` harmlessly); handle `OPTIONS` preflight. The pmtiles client reads the 16 KB header, then directories, then one range per tile; 2–3 small range GETs per tile cold, 1 per tile warm.

### (a) Self-hosted on the cluster

| server | Range | notes |
|---|---|---|
| nginx static (`location /tiles/ { root …; }`) | yes, native; `max_ranges` default unlimited (core module docs) | do **not** add `application/octet-stream` to `gzip_types` (on-the-fly gzip disables ranges; default `gzip_types text/html` is safe). Add `add_header Access-Control-Allow-Origin "https://<site>" always; add_header Access-Control-Allow-Headers "Range, If-Match" always; add_header Access-Control-Expose-Headers "ETag, Content-Range, Accept-Ranges" always;` and an `if ($request_method = OPTIONS) { return 204; }` block. `Cache-Control: public, max-age=…` + `ETag` come free; use a versioned filename (`rail-2026-10-09.pmtiles`) and long max-age. |
| Caddy `file_server` | yes (206) | `header` directive for CORS; optional `pmtiles_proxy` plugin serves `{z}/{x}/{y}` + TileJSON from a bucket or disk (useful for CDN caching per tile). |
| Go `http.FileServer`/`ServeContent` | yes — `fs.go`: FileServer → serveFile → serveContent, sets `Accept-Ranges: bytes`, honours `If-Range`, multipart ranges | fine if the API already serves static files; or `go-pmtiles` `pmtiles serve` (purpose-built, does tile requests + TileJSON with ETag). |

Cluster cost: ~0; the file sits on a PVC next to valhalla's PBF cache. Put the build in a CronJob (weekly, same cadence as Geofabrik) writing `rail-<date>.pmtiles` and update the URL the site uses.

### (b) Cloudflare R2 (pricing page, 2026-10)

Free tier (Standard storage): 10 GB-month storage, 1M Class A/month, **10M Class B/month**, **egress free**. Paid: $0.015/GB-month, $4.50/M Class A, $0.36/M Class B. A ranged `GetObject` is Class B. 200 MB file + 50k range reads/month → **$0.00** (0.2 GB-month, 50k of 10M Class B). Even 5M range reads/month stay free. CORS via wrangler/dashboard; HTTP/2.

### (c) Other free/cheap

- GitHub Pages: works for PMTiles up to 1 GB (protomaps docs), CORS `*`, but each file in git is capped at 100 MB (LFS not served) unless uploaded via `actions/upload-pages-artifact` — OK for CA+NV (~30 MB), awkward for US (~150 MB+).
- Backblaze B2: 10 GB free, egress free via Cloudflare, HTTP/1.1 only.
- Vercel (the site's host): static assets are capped well below 150 MB and are not a good fit for range-read archives.
- Tigris / Supabase / Bunny: listed by protomaps; nothing beats R2's free tier for this shape.

### Comparison

| option | cost (200 MB, 50k reads/mo) | ops burden | latency / caching | fits "prefer self-host" |
|---|---|---|---|---|
| nginx/Caddy on cluster, file on PVC | $0 | one Deployment + Ingress, CronJob build; already run similar | single node, no CDN; each tile = 1 range GET to the cluster (small) | yes |
| go-pmtiles `pmtiles serve` on cluster | $0 | same + one more image | can emit `{z}/{x}/{y}` for a CDN later | yes |
| Cloudflare R2 | $0 (free tier), ~$0.02/mo if it grew 10× | upload step in CI, CORS config | global edge, HTTP/2 | no (but zero-ops) |
| GitHub Pages | $0 | CI deploy | CDN; 100 MB/file git limit | no |

**Recommendation:** self-host the `.pmtiles` on the cluster behind nginx (or Caddy) with the CORS/`max-age` headers above, built by a weekly CronJob that reuses the Geofabrik PBFs already cached on the valhalla PVC. Keep the R2 path as the documented fallback: identical client URL shape, zero cost, if cluster egress or latency ever becomes a problem. Either way the client uses `pmtiles://https://…/rail-<date>.pmtiles` via the `pmtiles` Protocol in MapLibre and `new PMTiles(url)` for the graph walk.

---

## 5. terra-draw

| item | value (npm registry, 2026-10-10) |
|---|---|
| `terra-draw` | **1.37.0** (2026-10-06); no peer deps |
| `terra-draw-maplibre-gl-adapter` | **1.5.0** (2026-10-06); peerDependencies `terra-draw ^1.0.0`, **`maplibre-gl >=4`** → 6.13 OK (and 5.x) |
| gzip size | `terra-draw.modern.js` 256,867 B raw → **46.3 KB gz**; adapter 8,191 B → **2.7 KB gz** (measured with `gzip -c | wc -c`, not tree-shaken; the ESM build is tree-shakeable so importing only LineString + Select modes will be smaller) |

### Custom snapping

Yes. Type definitions in `common.d.ts` (1.37.0):

```ts
export type SnappableContext = { currentId?: FeatureId; currentCoordinate?: number;
  getCurrentGeometrySnapshot: () => (Polygon | LineString) | null; project: Project; unproject: Unproject };
export type SnapToCustom = (event: TerraDrawMouseEvent, context: SnappableContext) => Position | undefined;
interface OneDimensionalSnapping { toCoordinate?: boolean; toFeature?: SnapToFeature; toCustom?: SnapToCustom; }
export interface Snapping extends OneDimensionalSnapping { toLine?: boolean; toDegree?: SnapToDegree; }
```

- `TerraDrawLineStringMode({ snapping: { toCustom: (event, ctx) => Position | undefined } })` — `TerraDrawLineStringModeOptions.snapping?: Snapping`. Return `undefined` to not snap. The callback is synchronous, so the rail graph must already be in memory (fetch tiles on `moveend`/idle, not inside the callback).
- Select mode: `flags.<mode>.feature.coordinates.snappable?: boolean | Snapping` — the same `Snapping` object, so **`toCustom` works while dragging vertices in select mode** too.
- History (`packages/terra-draw/CHANGELOG.md`): `toCustom` existed in polygon mode by **1.3.0 (2025-03-16)** ("provide context object argument to toCustom callback in polygon mode #489"); select-mode `snappable` added **1.4.x (#519)**; **1.8.0 (2025-06-12)** "unify snapping functionality across polygon, linestring and select modes (#565)" is when linestring got the full `Snapping` object incl. `toCustom`; 1.21.0 fixed toLine/toCoordinate in linestring; **1.32.0 (2026-07-12)** added `toFeature` ("snapping to arbitrary features in the store #925"); 1.36/1.37 added degree snapping and point/marker snapping. The 4.MODES guide: `toCustom` "can come from store features or synchronous external data".
- Terra-draw snaps *vertices*; the "fill in real track vertices between clicks" step is ours: after each `finish`/`change` event, replace the drawn 2-point segment with the routed polyline via `draw.updateFeatureGeometry`/`addFeatures` (or keep the user's clicks as the editable feature and render the routed geometry in our own layer — simpler for re-editing).

### Select mode editing

`flags.linestring.feature.coordinates: { midpoints: true | {draggable:true}, draggable: true, deletable: true, snappable: Snapping, resizable, validation }` — midpoint insertion (**1.3.0**, #497 made midpoints draggable), vertex deletion and drag all supported. `TerraDrawLineStringMode({ editable: true })` (1.2.0) allows dragging vertices without switching to select.

### Layer ids / paint order

Adapter source (`terra-draw-maplibre-gl-adapter.ts`): config `{ map, renderBelowLayerId?: string, prefixId?: string (default "td") }`. Layers/sources created: `td-point`, `td-point-marker`, `td-linestring`, `td-polygon`, `td-polygon-outline` (prefix configurable). With `renderBelowLayerId` the adapter moves its layers beneath that layer (marker layer is not moved). Per-feature `styles.zIndex` → `line-sort-key` within a layer only. Create the adapter inside `map.on('style.load')`. So: pick `prefixId: 'route-editor'` and `renderBelowLayerId: <our labels layer>` to slot into the existing paint stack.

---

## 6. OSM coverage: CAHSR and Brightline West

Overpass (`overpass-api.de`, data timestamp 2026-10-10T04:54Z; queries `tmp/q1.ql`, `tmp/q3.ql`, results `tmp/dl/cahsr.json`, `tmp/dl/q3.json`):

**California High-Speed Rail** — extensively mapped, 1,229 ways matched name/operator:
- 484 ways `railway=construction` + `construction=rail` (e.g. way 335854807 "Construction Package 1", 335854749 "Construction Packages 2 & 3", 665464718 "CP4") with `operator=California High Speed Rail Authority`, `usage=main`, `gauge=1435`, `maxspeed=220 mph`/`250 mph`, `highspeed=yes`, some `electrified=contact_line`.
- 732 ways `railway=proposed` + `proposed=rail` (Bay/Pacheco/Capitol/Sierra/Desert/San Jacinto/Tonga subdivisions, Bakersfield–Palmdale, Merced/Gilroy station tracks), 12 `railway=proposed` with no `proposed=*`, 1 `proposed=station`.
- Route relations: 9466653/4/5/6 "California High Speed Rail Proposal, Phase 1 South / Phase 2 South / Phase 2 North / Phase 1 North" (`type=route, route=railway`, 9466656 has `opening_date=2031`). Members include existing `railway=rail` ways (386 "Caltrain Peninsula Subdivision", 18 "UP Coast Subdivision") — i.e. the shared-corridor segments are already real track.

**Brightline West** — mapped: 243 ways named "Brightline West", `railway=construction` with **both** `construction=rail` and `construction:railway=rail`, `usage=main`, `gauge=1435`, `highspeed=yes`, `electrified=construction`, `maxspeed=90 mph`…`180 mph`, `opening_date=2028` (e.g. way 856171474; way 1051895741 "Phase 2" per osm.org). Relations 14039872 (`type=route, route=train, operator=Brightline`) and 21311551 (`route=railway`). In total 270 member ways carry `construction=rail` + `construction:railway=rail`.

Tagging conventions (OSM wiki `Key:proposed`, `OpenRailwayMap/Tagging`): planned → `railway=proposed` + `proposed=rail`; under construction → `railway=construction` + `construction=rail` (lifecycle-prefix `construction:railway=rail` also seen, as on Brightline). Standard carto does not render either; OpenRailwayMap does.

**OpenRailwayMap rendering** (`hiddewie/OpenRailwayMap-vector`, `proxy/js/styles.mjs`): state-based dash arrays — `construction_dasharray = [4.5, 4.5]`, `proposed_dasharray = [1, 4]`, `disused/abandoned = [2.5, 2.5]`, `razed = [1, 5]`, present solid; construction/proposed drawn from z7 (`railway_line_med`) and all dashed states from z8 (`railway_line_high`), "future" colour class for construction/proposed; visibility behind `showConstructionInfrastructure`/`showProposedInfrastructure` toggles. Stack: osm2pgsql → PostGIS → Martin → PMTiles, daily updates. Their USAGE.md allows third-party app use of tiles with attribution, best-effort, no bulk download, must send a real `Referer` — a possible stopgap, not something to build on.

---

## Recommendations

1. **Keep OpenFreeMap positron as the basemap; do not use it for snapping.** It lacks `railway=construction/proposed`, `name`, `maxspeed`, and merges ways so ids are not per-way. Usage terms are fine for the product.
2. **Build a dedicated rail PMTiles layer** from Geofabrik PBFs with `osmium tags-filter` → `osmium export` (`"id": true`, `include_tags`) → `tippecanoe --use-attribute-for-id=@id -y … -pS -z 14`. Measured CA+NV: **11.6 MB** (38,054 ways, 20.3 MB GeoJSONL); projected US ~140 MB (120–180). Include `construction`, `proposed`, `disused`, and both `construction=*` and `construction:railway=*` variants. CAHSR and Brightline West are fully present in OSM today with these tags.
3. **Build in CI or a cluster CronJob**: GH Actions `ubuntu-24.04` gives `osmium-tool 1.16` via apt and tippecanoe via `pip install tippecanoe` in seconds; the valhalla image has neither tool, but the valhalla PVC already caches the same PBFs and a sibling Job can reuse them. Planetiler is a viable single-tool alternative for CA+NV but needs ~6 GB heap for the US file.
4. **Host the archive on the cluster** (nginx static or `pmtiles serve`) with Range + CORS (`Range, If-Match` allowed; `ETag` exposed) and a versioned filename + long `Cache-Control`. R2 is the $0 fallback (50k reads/month is <1% of the free tier).
5. **Client**: `pmtiles` Protocol for drawing the rail layer; for snapping/routing read z14 tiles directly with `PMTiles.getZxy` + `@mapbox/vector-tile`, build a coordinate-keyed graph (OSM ways share exact node coordinates at junctions; dedupe buffer duplicates by edge key), route between consecutive clicks, and keep the user's click vertices as the editable terra-draw feature.
6. **terra-draw 1.37.0 + maplibre adapter 1.5.0** (peer `maplibre-gl >=4`, ~49 KB gz total) satisfies every requirement: `snapping.toCustom(event, ctx)` in LineString mode (since 1.8.0) and in select mode via `coordinates.snappable`, midpoint insertion / vertex deletion flags, and `prefixId` / `renderBelowLayerId` for layer ordering.
