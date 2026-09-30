const EARTH_RADIUS_M = 6371000

const toRad = (deg: number): number => (deg * Math.PI) / 180

interface PlanarFrame {
  x: (lng: number) => number
  y: (lat: number) => number
}

// The frame the shared fixture pins: equirectangular about the *whole* line's
// mean latitude, so every leg of one line is measured at the same scale.
function planarFrame(coordinates: [number, number][]): PlanarFrame {
  const refLatRad = toRad(
    coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length,
  )
  const cosRef = Math.cos(refLatRad)
  return {
    x: (lng: number): number => EARTH_RADIUS_M * toRad(lng) * cosRef,
    y: (lat: number): number => EARTH_RADIUS_M * toRad(lat),
  }
}

export function chainageAlong(coordinates: [number, number][]): number[] {
  if (coordinates.length === 0) return []

  const { x, y } = planarFrame(coordinates)

  const out = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const [aLng, aLat] = coordinates[i - 1]
    const [bLng, bLat] = coordinates[i]
    out.push(out[i - 1] + Math.hypot(x(bLng) - x(aLng), y(bLat) - y(aLat)))
  }
  return out
}

export interface AlignmentProjection {
  chainageM: number
  offsetM: number
}

export function projectOntoAlignment(
  coordinates: [number, number][],
  point: [number, number],
): AlignmentProjection | null {
  if (coordinates.length < 2) return null

  const { x, y } = planarFrame(coordinates)
  const chainage = chainageAlong(coordinates)
  const px = x(point[0])
  const py = y(point[1])

  let best: AlignmentProjection | null = null
  for (let i = 1; i < coordinates.length; i++) {
    const ax = x(coordinates[i - 1][0])
    const ay = y(coordinates[i - 1][1])
    const bx = x(coordinates[i][0])
    const by = y(coordinates[i][1])
    const dx = bx - ax
    const dy = by - ay
    const legLengthSqM = dx * dx + dy * dy
    // A duplicate vertex is a leg with no direction to project onto; either of
    // its ends is the nearest point on it.
    const t = legLengthSqM > 0
      ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / legLengthSqM))
      : 0
    const offsetM = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    // Ties keep the earlier leg: a point abeam a vertex projects onto both legs
    // that meet there, and they agree on the chainage anyway.
    if (best && offsetM >= best.offsetM) continue
    best = { chainageM: chainage[i - 1] + t * Math.sqrt(legLengthSqM), offsetM }
  }
  return best
}

export function sliceAlignment(
  coordinates: [number, number][],
  fromChainageM: number,
  toChainageM: number,
  fraction: number,
): [number, number][] {
  if (coordinates.length < 2) return []

  const covered = Math.min(1, Math.max(0, fraction))
  const cutM = fromChainageM + covered * (toChainageM - fromChainageM)
  const ascending = cutM >= fromChainageM
  const lo = ascending ? fromChainageM : cutM
  const hi = ascending ? cutM : fromChainageM
  if (hi - lo <= 0) return []

  const span = spanBetween(coordinates, lo, hi)
  return ascending ? span : span.reverse()
}

function spanBetween(
  coordinates: [number, number][],
  loM: number,
  hiM: number,
): [number, number][] {
  const chainage = chainageAlong(coordinates)
  const lineLengthM = chainage[chainage.length - 1]
  if (lineLengthM <= 0) return []

  const lo = Math.max(0, Math.min(loM, lineLengthM))
  const hi = Math.max(0, Math.min(hiM, lineLengthM))
  if (hi - lo <= 0) return []

  const start = pointAt(coordinates, chainage, lo)
  const end = pointAt(coordinates, chainage, hi)
  // A span shorter than the coordinates can express collapses to a single
  // point. "No floor on the fraction" still requires a line to be a line: two
  // identical coordinates would put a zero-length LineString on the map and
  // plant a cap on it with nothing underneath.
  if (start[0] === end[0] && start[1] === end[1]) return []

  const out: [number, number][] = [start]
  for (let i = 0; i < coordinates.length; i++) {
    if (chainage[i] > lo && chainage[i] < hi) out.push(coordinates[i])
  }
  out.push(end)
  return out
}

function pointAt(
  coordinates: [number, number][],
  chainage: number[],
  atM: number,
): [number, number] {
  if (atM <= 0) return coordinates[0]
  const last = coordinates.length - 1
  if (atM >= chainage[last]) return coordinates[last]

  let i = 1
  while (i < last && chainage[i] < atM) i++

  const legLengthM = chainage[i] - chainage[i - 1]
  // A duplicate vertex is zero-length; the chainage cannot fall strictly inside
  // it, so either endpoint is the same point.
  const t = legLengthM > 0 ? (atM - chainage[i - 1]) / legLengthM : 0
  const [aLng, aLat] = coordinates[i - 1]
  const [bLng, bLat] = coordinates[i]
  return [aLng + t * (bLng - aLng), aLat + t * (bLat - aLat)]
}
