// Freezes the plot the How it works tour draws: 90 minutes by Transit from
// Little Tokyo on California High-Speed Rail, with the network it is drawn on.
// Run it with `make tour-fixture` when the network or the router changes what a
// plot looks like; pass `--plot <routing-job.json>` to reuse a captured job
// rather than plotting a new one.
//
// It keeps its own types: the app's pull in JSON imports that Node's type
// stripping cannot load. chainage.ts imports nothing, so it is shared.

import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { projectOntoAlignment, sliceAlignment } from '../src/chainage.ts'

type Position = number[]
interface Feature { type: 'Feature'; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }
interface Plot { type: 'FeatureCollection'; features: Feature[]; metadata: Record<string, unknown> }
interface Route { id: string; scenario_id: string; name: string; mode: string; geometry: { type: 'LineString'; coordinates: Position[] }; bidirectional: boolean }
interface Station { id: string; scenario_id: string; slug: string; name: string; location: { type: 'Point'; coordinates: Position }; platform_height: string }

const API = process.env.SPARKS_API ?? 'https://sparks-effect-api-production.up.railway.app'
const OUT = new URL('../src/fixtures/tourSample.json', import.meta.url)
const MAX_BYTES = 200_000
const START = { label: 'Little Tokyo, Los Angeles', lat: 34.0497, lng: -118.2405 }
const REQUEST = { scenario_slug: 'ca-hsr', lat: START.lat, lng: START.lng, budget_mins: 90, mode: 'transit' }
const FEATURE_KEYS = ['source', 'station_slug', 'remaining_mins']
const ROUTE_TOLERANCE_M = 4
const MAX_CAP_SHIFT_M = 50

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json' } })
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path}: ${response.status}`)
  return response.json() as Promise<T>
}

async function plotFromApi(): Promise<Plot> {
  const job = await json<{ id: string }>('/api/isochrone', { method: 'POST', body: JSON.stringify(REQUEST) })
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const polled = await json<{ status: string; result?: Plot }>(`/api/routing-jobs/${job.id}`)
    if (polled.status === 'succeeded' && polled.result) return polled.result
    if (polled.status === 'failed') throw new Error(`routing job ${job.id} failed`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`routing job ${job.id} did not finish in 120s`)
}

function plotFromFile(path: string): Plot {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { result?: Plot } & Plot
  return parsed.result ?? parsed
}

const round = (v: number) => Math.round(v * 1e5) / 1e5

function roundLine(line: Position[]): Position[] {
  return line.map((p) => p.map(round))
}

const M_PER_DEG = 111_320

function simplify(line: Position[], toleranceM: number): Position[] {
  const meanLat = line.reduce((sum, [, lat]) => sum + lat, 0) / line.length
  const cos = Math.cos((meanLat * Math.PI) / 180)
  const xy = line.map(([lng, lat]) => [lng * M_PER_DEG * cos, lat * M_PER_DEG])
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack: [number, number][] = [[0, line.length - 1]]
  while (stack.length > 0) {
    const [a, b] = stack.pop()!
    const [ax, ay] = xy[a]
    const [bx, by] = xy[b]
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let worst = -1
    let worstAt = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i]
      const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      if (d > worst) [worst, worstAt] = [d, i]
    }
    if (worst > toleranceM) {
      keep[worstAt] = 1
      stack.push([a, worstAt], [worstAt, b])
    }
  }
  return line.filter((_, i) => keep[i])
}

function pointAt(line: [number, number][], chainageM: number): [number, number] {
  const span = sliceAlignment(line, 0, chainageM, 1)
  return span.length > 0 ? span[span.length - 1] : line[0]
}

const distanceM = ([aLng, aLat]: number[], [bLng, bLat]: number[]) =>
  Math.hypot((aLng - bLng) * M_PER_DEG * Math.cos((aLat * Math.PI) / 180), (aLat - bLat) * M_PER_DEG)

interface Progress { route_id: string; from_chainage_m: number; to_chainage_m: number; fraction: number; to: string }

function remeasure(progress: Progress[], full: Route[], simplified: Route[]): Progress[] {
  // An unfinished leg is a chainage span along the server's vertices, and the
  // site measures chainage from whatever vertices it is given; so on the
  // simplified line each span is re-measured between the same two points, the
  // fraction ridden is left exactly as the server reported it, and the run
  // fails if the point the budget ran out moves more than MAX_CAP_SHIFT_M.
  return progress.map((leg) => {
    const before = full.find((r) => r.id === leg.route_id)?.geometry.coordinates as [number, number][] | undefined
    const after = simplified.find((r) => r.id === leg.route_id)?.geometry.coordinates as [number, number][] | undefined
    if (!before || !after) return leg
    const from = projectOntoAlignment(after, pointAt(before, leg.from_chainage_m))
    const to = projectOntoAlignment(after, pointAt(before, leg.to_chainage_m))
    if (!from || !to) throw new Error(`cannot re-measure the unfinished leg toward ${leg.to}`)
    const moved = { ...leg, from_chainage_m: from.chainageM, to_chainage_m: to.chainageM }
    const cap = (line: [number, number][], l: Progress) => {
      const span = sliceAlignment(line, l.from_chainage_m, l.to_chainage_m, l.fraction)
      return span[span.length - 1]
    }
    const shiftM = distanceM(cap(before, leg), cap(after, moved))
    console.log(`unfinished leg toward ${leg.to}: end moved ${shiftM.toFixed(1)} m`)
    if (shiftM > MAX_CAP_SHIFT_M) throw new Error(`unfinished leg toward ${leg.to} moved ${shiftM.toFixed(0)} m`)
    return moved
  })
}

function roundRing(ring: Position[]): Position[] | null {
  const out: Position[] = []
  for (const [lng, lat] of ring) {
    const p = [round(lng), round(lat)]
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  const [first, last] = [out[0], out[out.length - 1]]
  if (first && (first[0] !== last[0] || first[1] !== last[1])) out.push([...first])
  return out.length >= 4 ? out : null
}

function roundPolygon(polygon: Position[][]): Position[][] | null {
  const rings = polygon.map(roundRing)
  // A hole that collapses is dropped; an outer ring that collapses drops the polygon.
  if (!rings[0]) return null
  return rings.filter((r): r is Position[] => r !== null)
}

function trimFeature(feature: Feature): Feature | null {
  const properties = Object.fromEntries(
    FEATURE_KEYS.filter((k) => feature.properties[k] !== undefined).map((k) => [k, feature.properties[k]]),
  )
  const { type, coordinates } = feature.geometry
  const polygons = (type === 'Polygon' ? [coordinates] : coordinates) as Position[][][]
  const kept = polygons.map(roundPolygon).filter((p): p is Position[][] => p !== null)
  if (kept.length === 0) return null
  return { type: 'Feature', properties, geometry: { type: 'MultiPolygon', coordinates: kept } }
}

function trimMetadata(metadata: Record<string, unknown>, full: Route[], simplified: Route[]): Record<string, unknown> {
  const out = { ...metadata }
  const walk = metadata.starter_walk as { geometry: { coordinates: Position[] } } | undefined
  if (walk) out.starter_walk = { ...walk, geometry: { ...walk.geometry, coordinates: roundLine(walk.geometry.coordinates) } }
  const progress = metadata.trip_progress as Progress[] | undefined
  if (progress) out.trip_progress = remeasure(progress, full, simplified)
  return out
}

const plotArg = process.argv.indexOf('--plot')
const plot = plotArg !== -1 ? plotFromFile(process.argv[plotArg + 1]) : await plotFromApi()
const scenario = await json<{ routes: Route[]; stations: Station[] }>('/api/scenarios/ca-hsr')

// Simplified to within ROUTE_TOLERANCE_M metres, under a pixel at the closest
// zoom the tour shows: the main line drops from about 20,000 vertices to about
// 1,100, and the fixture from over 500 KB to under 100 KB.
const routes = scenario.routes.map(({ id, scenario_id, name, mode, geometry, bidirectional }) => ({
  id, scenario_id, name, mode, bidirectional,
  geometry: { type: 'LineString' as const, coordinates: roundLine(simplify(geometry.coordinates, ROUTE_TOLERANCE_M)) },
}))

const out = {
  // The day in California, where the plot's 8 a.m. weekday clock runs.
  captured: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
  start: START,
  budget_mins: REQUEST.budget_mins,
  mode: REQUEST.mode,
  plot: {
    type: 'FeatureCollection',
    features: plot.features.map(trimFeature).filter((f): f is Feature => f !== null),
    metadata: trimMetadata(plot.metadata, scenario.routes, routes),
  },
  routes,
  stations: scenario.stations.map(({ id, scenario_id, slug, name, location, platform_height }) => ({
    id, scenario_id, slug, name, platform_height,
    location: { type: 'Point', coordinates: location.coordinates.map(round) },
  })),
}

const text = `${JSON.stringify(out)}\n`
writeFileSync(OUT, text)
const bytes = Buffer.byteLength(text)
console.log(`wrote ${OUT.pathname}: ${bytes} bytes, ${gzipSync(text).length} gzipped`)
if (bytes > MAX_BYTES) {
  console.error(`over the ${MAX_BYTES}-byte budget`)
  process.exit(1)
}
