import { ISOCHRONE_FILL_OPACITY, resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH } from '../composables/useOriginWalkLayer'
import {
  PROGRESS_CAP_RADIUS,
  PROGRESS_LINE_DASH,
  ROUTE_LINE_WIDTH,
  STATION_DOT_DEFAULT_COLOR,
  STATION_DOT_RADIUS,
  STATION_DOT_STROKE_WIDTH,
  routeLineColor,
} from '../composables/useRouteLayer'
import { readThemeToken } from '../themeTokens'

export function svgDash(dash: readonly number[], width: number): string {
  // MapLibre measures a dash in line widths; SVG measures it in pixels.
  return dash.map((d) => d * width).join(' ')
}

export interface SampleMapPaint {
  origin: string
  egress: string
  fillOpacity: number
  unridden: string
  ink: string
  reachedStation: string
  unreachedStation: string
  pin: string
  lineWidth: number
  progressDash: string
  capRadius: number
  stationRadius: number
  stationStrokeWidth: number
  walkWidth: number
  walkDash: string
}

// Every value is read from the module that paints the real map, so the sample
// cannot drift from it: only the sample's geometry is drawn by hand.
export function sampleMapPaint(): SampleMapPaint {
  const { origin, egress } = resolveIsochroneColors()
  return {
    origin,
    egress,
    fillOpacity: ISOCHRONE_FILL_OPACITY,
    unridden: routeLineColor(true),
    ink: readThemeToken('--color-ink'),
    reachedStation: egress,
    unreachedStation: STATION_DOT_DEFAULT_COLOR,
    pin: readThemeToken('--color-coral'),
    lineWidth: ROUTE_LINE_WIDTH,
    progressDash: svgDash(PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH),
    capRadius: PROGRESS_CAP_RADIUS,
    stationRadius: STATION_DOT_RADIUS,
    stationStrokeWidth: STATION_DOT_STROKE_WIDTH,
    walkWidth: ORIGIN_WALK_LINE_WIDTH,
    walkDash: svgDash(ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH),
  }
}

export const SAMPLE_MAP_PARTS = [
  'origin-fill',
  'egress-fill',
  'route-line',
  'ridden-line',
  'progress-line',
  'progress-cap',
  'station-dots',
  'origin-walk',
  'origin-marker',
] as const

export type SampleMapPart = (typeof SAMPLE_MAP_PARTS)[number]

type Point = readonly [number, number]
type Cubic = readonly [Point, Point, Point, Point]

const fmt = (n: number) => String(Math.round(n * 10) / 10)
const pt = ([x, y]: Point) => `${fmt(x)} ${fmt(y)}`

// Catmull-Rom through every point, as cubic Béziers: the curve passes through
// each station, so a ridden leg or a stub can reuse the very segments the
// whole line is drawn with and sit exactly on top of it.
function smoothSegments(points: readonly Point[], closed: boolean): Cubic[] {
  const n = points.length
  const at = (i: number) => closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]
  const segments: Cubic[] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    segments.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ])
  }
  return segments
}

function pathOf(segments: readonly Cubic[], closed = false): string {
  const body = segments.map(([, c1, c2, end]) => `C${pt(c1)} ${pt(c2)} ${pt(end)}`).join(' ')
  return `M${pt(segments[0][0])} ${body}${closed ? ' Z' : ''}`
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// De Casteljau: the part of a segment from its start to t.
function cubicUpTo([p0, p1, p2, p3]: Cubic, t: number): Cubic {
  const a = lerp(p0, p1, t)
  const b = lerp(p1, p2, t)
  const c = lerp(p2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  return [p0, a, d, lerp(d, e, t)]
}

function reversed([p0, p1, p2, p3]: Cubic): Cubic {
  return [p3, p2, p1, p0]
}

// A splash zone's edge is ragged where it follows streets out and pulls back
// between them. A few low harmonics of the radius give that lobed outline
// without the spikes of random noise, and the same terms always draw the same
// shape.
type Lobe = readonly [harmonic: number, amplitude: number, phase: number]

function blob([cx, cy]: Point, radius: number, lobes: readonly Lobe[], squash = 1): string {
  const SPOKES = 30
  const points = Array.from({ length: SPOKES }, (_, i): Point => {
    const angle = (i / SPOKES) * Math.PI * 2
    const r = radius * (1 + lobes.reduce((sum, [k, a, p]) => sum + a * Math.sin(k * angle + p), 0))
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * squash]
  })
  return pathOf(smoothSegments(points, true), true)
}

const STATIONS: readonly Point[] = [
  [34, 200],
  [102, 164],
  [182, 130],
  [258, 100],
  [326, 56],
]
const LINE = smoothSegments([[-6, 224], ...STATIONS, [372, 22]], false)
const START: Point = [216, 178]

export const SAMPLE_GEOMETRY = {
  viewBox: '0 0 360 240',
  roads: [
    { d: 'M-4 118 C80 110 150 98 222 104 S320 130 364 124', width: 5 },
    { d: 'M146 -4 C156 70 200 160 206 244', width: 4 },
    { d: 'M-4 58 L364 34', width: 2 },
    { d: 'M-4 176 C90 182 260 204 364 196', width: 2 },
    { d: 'M58 -4 L80 244', width: 2 },
    { d: 'M282 -4 C276 80 286 160 306 244', width: 2 },
    { d: 'M118 244 L246 168 L364 162', width: 1.5 },
    { d: 'M18 110 L30 244', width: 1.5 },
    { d: 'M196 36 L340 -4', width: 1.5 },
    { d: 'M120 8 L124 60', width: 1.5 },
  ],
  originFill: blob([206, 162], 56, [[2, 0.1, 0.6], [3, 0.08, 2.1], [5, 0.05, 0.4], [7, 0.03, 1.3]], 0.78),
  egressFills: [
    blob([108, 160], 44, [[2, 0.12, 1.9], [3, 0.09, 0.2], [5, 0.05, 2.7], [7, 0.03, 0.9]], 0.86),
    blob([178, 124], 38, [[2, 0.1, 0.3], [3, 0.08, 1.5], [5, 0.05, 2.2]], 0.9),
    blob([254, 98], 48, [[2, 0.12, 2.6], [3, 0.08, 0.9], [5, 0.05, 1.7], [7, 0.03, 2.9]], 0.82),
  ],
  route: pathOf(LINE),
  ridden: pathOf(LINE.slice(2, 4)),
  progress: [cubicUpTo(reversed(LINE[1]), 0.5), cubicUpTo(LINE[4], 0.55)].map((segment) => ({
    d: pathOf([segment]),
    cap: segment[3],
  })),
  stations: STATIONS.map(([x, y], i) => ({ x, y, reached: i >= 1 && i <= 3 })),
  walk: `M${pt(START)} L214 154 L192 146 L${pt(STATIONS[2])}`,
  start: START,
}
