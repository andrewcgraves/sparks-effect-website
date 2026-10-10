import { chainageAlong, planarFrame } from './chainage'
import { ROUTE_MODES, type RouteInput } from './api/authoring/types'

export interface RouteFault {
  field: string
  index?: number
  rule: string
  message: string
}

export const MIN_ROUTE_POINTS = 2
const MAX_CANT_MM = 300
const MIN_CURVE_RADIUS_M = 20
const MAX_CURVE_RADIUS_M = 100000
const MAX_GRADE_PCT = 15
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function inRange(value: number, lo: number, hi: number): boolean {
  return value >= lo && value <= hi
}

function positionFaults(i: number, pos: number[]): RouteFault[] {
  if (pos.length !== 2) {
    return [{ field: 'coordinates', index: i, rule: 'count', message: `coordinate ${i}: must be [longitude, latitude], got ${pos.length} values` }]
  }
  const faults: RouteFault[] = []
  const [lng, lat] = pos
  if (!inRange(lng, -180, 180)) {
    faults.push({ field: 'coordinates.lng', index: i, rule: 'range', message: `coordinate ${i}: longitude ${lng} is outside [-180, 180]` })
  }
  if (!inRange(lat, -90, 90)) {
    faults.push({ field: 'coordinates.lat', index: i, rule: 'range', message: `coordinate ${i}: latitude ${lat} is outside [-90, 90]` })
  }
  return faults
}

function segmentFaults(i: number, seg: { cant_mm: number; curve_radius_m: number; grade_pct: number }): RouteFault[] {
  const faults: RouteFault[] = []
  if (!inRange(seg.cant_mm, 0, MAX_CANT_MM)) {
    faults.push({ field: 'segments.cant_mm', index: i, rule: 'range', message: `segment ${i}: cant_mm ${seg.cant_mm} is outside [0, ${MAX_CANT_MM}]` })
  }
  // Radius 0 is the sentinel for tangent track, accepted below the minimum
  // real curve radius, exactly as the API accepts it.
  if (seg.curve_radius_m !== 0 && !inRange(seg.curve_radius_m, MIN_CURVE_RADIUS_M, MAX_CURVE_RADIUS_M)) {
    faults.push({
      field: 'segments.curve_radius_m',
      index: i,
      rule: 'range',
      message: `segment ${i}: curve_radius_m ${seg.curve_radius_m} is outside [${MIN_CURVE_RADIUS_M}, ${MAX_CURVE_RADIUS_M}] (use 0 for tangent track)`,
    })
  }
  if (!inRange(seg.grade_pct, -MAX_GRADE_PCT, MAX_GRADE_PCT)) {
    faults.push({ field: 'segments.grade_pct', index: i, rule: 'range', message: `segment ${i}: grade_pct ${seg.grade_pct} is outside [-${MAX_GRADE_PCT}, ${MAX_GRADE_PCT}]` })
  }
  return faults
}

// Mirrors route.Validate in sparks-effect-api, field for field and rule for
// rule, so a fault found here is worded by the same table as one the API
// sends back, and a draft that passes here is one the API will accept.
export function validateRouteInput(input: RouteInput): RouteFault[] {
  const faults: RouteFault[] = []
  const { coordinates, properties } = input

  if (input.type !== 'LineString') {
    faults.push({ field: 'type', rule: 'type', message: `geometry type must be "LineString", got "${input.type}"` })
  }
  if (coordinates.length < MIN_ROUTE_POINTS) {
    faults.push({ field: 'coordinates', rule: 'min_count', message: `a route needs at least ${MIN_ROUTE_POINTS} coordinates, got ${coordinates.length}` })
  }
  coordinates.forEach((pos, i) => {
    faults.push(...positionFaults(i, pos))
    const previous = coordinates[i - 1]
    if (i > 0 && pos.length >= 2 && previous.length >= 2 && previous[0] === pos[0] && previous[1] === pos[1]) {
      faults.push({ field: 'coordinates', index: i, rule: 'zero_length', message: `coordinate ${i} repeats coordinate ${i - 1}, giving a zero-length segment` })
    }
  })

  if (properties.name.trim() === '') {
    faults.push({ field: 'name', rule: 'required', message: 'name is required' })
  }
  if (properties.mode !== '' && !(ROUTE_MODES as readonly string[]).includes(properties.mode)) {
    faults.push({ field: 'mode', rule: 'unknown', message: `unknown mode "${properties.mode}"` })
  }
  const slug = (properties as { slug?: string }).slug
  if (slug && !SLUG_PATTERN.test(slug)) {
    faults.push({ field: 'slug', rule: 'format', message: `slug "${slug}" must be lowercase alphanumeric words separated by single hyphens` })
  }

  const segments = properties.segments ?? []
  if (segments.length > 0) {
    const want = coordinates.length - 1
    if (segments.length !== want) {
      faults.push({ field: 'segments', rule: 'count', message: `expected ${want} segments for ${coordinates.length} coordinates, got ${segments.length}` })
    }
    segments.forEach((seg, i) => faults.push(...segmentFaults(i, seg)))
  }

  return faults
}

export class GeoJsonImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeoJsonImportError'
  }
}

export const MULTI_LINE_IMPORT_FAULT = 'Only a single line can be imported.'

interface LooseGeometry {
  type?: unknown
  coordinates?: unknown
  geometry?: unknown
  features?: unknown
}

function asObject(value: unknown): LooseGeometry | null {
  return typeof value === 'object' && value !== null ? (value as LooseGeometry) : null
}

// The one LineString in whatever was pasted or dropped: a bare geometry, a
// Feature wrapping one, or a FeatureCollection holding exactly one. Anything
// else is named for what it was, so the author knows what to change.
function findLineString(root: LooseGeometry): unknown[] {
  if (root.type === 'LineString') {
    if (!Array.isArray(root.coordinates)) throw new GeoJsonImportError("The line's coordinates are missing.")
    return root.coordinates
  }
  if (root.type === 'MultiLineString') throw new GeoJsonImportError(MULTI_LINE_IMPORT_FAULT)
  if (root.type === 'Feature') {
    const geometry = asObject(root.geometry)
    if (!geometry) throw new GeoJsonImportError('This feature has no geometry.')
    return findLineString(geometry)
  }
  if (root.type === 'FeatureCollection') {
    if (!Array.isArray(root.features)) throw new GeoJsonImportError('This collection has no features.')
    const lines = root.features
      .map((feature) => asObject(asObject(feature)?.geometry))
      .filter((geometry): geometry is LooseGeometry => geometry !== null)
      .filter((geometry) => geometry.type === 'LineString' || geometry.type === 'MultiLineString')
    if (lines.length === 0) throw new GeoJsonImportError('No line found in this GeoJSON.')
    if (lines.length > 1) throw new GeoJsonImportError(`This GeoJSON holds ${lines.length} lines. Import one at a time.`)
    return findLineString(lines[0])
  }
  const kind = typeof root.type === 'string' ? `a ${root.type}` : 'something this builder cannot read'
  throw new GeoJsonImportError(`This GeoJSON is ${kind}, not a line.`)
}

export function normaliseImportedGeoJson(text: string): [number, number][] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GeoJsonImportError("This isn't valid JSON.")
  }
  const root = asObject(parsed)
  if (!root) throw new GeoJsonImportError('This GeoJSON is not an object.')

  const points: [number, number][] = []
  findLineString(root).forEach((position, i) => {
    const pos = Array.isArray(position) ? position : []
    const [lng, lat] = pos
    if (pos.length < 2 || typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new GeoJsonImportError(`Point ${i + 1} isn't a longitude and latitude pair.`)
    }
    // Altitude and anything after it are dropped, which is what the API's
    // position rule asks for; a repeated point is dropped because it would
    // be a zero-length span, and a traced line often doubles its corners.
    const last = points[points.length - 1]
    if (last && last[0] === lng && last[1] === lat) return
    points.push([lng, lat])
  })
  return points
}

export function routeLengthM(coordinates: number[][]): number {
  if (coordinates.length < 2) return 0
  const chainage = chainageAlong(coordinates as [number, number][])
  return chainage[chainage.length - 1]
}

export function formatKm(lengthM: number | undefined): string {
  if (lengthM === undefined || !Number.isFinite(lengthM)) return ''
  return `${(lengthM / 1000).toFixed(1)} km`
}

export const SIMPLIFY_TOLERANCE_M = 10

export function dropRepeatedPoints(coordinates: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [lng, lat] of coordinates) {
    const last = out[out.length - 1]
    if (last && last[0] === lng && last[1] === lat) continue
    out.push([lng, lat])
  }
  return out
}

function segmentOffset(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Douglas–Peucker in the same planar frame chainage is measured in, so the
// tolerance is metres on the ground. A traced route carries a point at every
// bend of the railway it followed, and the physics splits a span per point;
// dropping those within toleranceM of a straight run keeps the shape and
// loses the splits. Ends are always kept, repeats always dropped.
export function simplifyRoute(coordinates: [number, number][], toleranceM: number): [number, number][] {
  const points = dropRepeatedPoints(coordinates)
  if (points.length < 3) return points
  const { x, y } = planarFrame(points)
  const xs = points.map(([lng]) => x(lng))
  const ys = points.map(([, lat]) => y(lat))
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let farthest = -1
    let farthestOffset = toleranceM
    for (let i = first + 1; i < last; i++) {
      const offset = segmentOffset(xs[i], ys[i], xs[first], ys[first], xs[last], ys[last])
      if (offset > farthestOffset) {
        farthest = i
        farthestOffset = offset
      }
    }
    if (farthest === -1) continue
    keep[farthest] = true
    stack.push([first, farthest], [farthest, last])
  }
  return points.filter((_, i) => keep[i])
}
