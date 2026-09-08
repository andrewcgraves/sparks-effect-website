// This is the only place the front end computes distance itself. Everything
// else — snapped stop positions, offsets, the chainages on a compiled edge —
// arrives already measured from the API, which is why this module exists at all
// and why it is pinned by a fixture rather than by discipline.
//
// Chainage is measured in an equirectangular planar frame about the *whole
// line's* mean latitude, using a 6371000 m mean Earth radius. It is
// deliberately not haversine. The API measures in exactly this frame, and the
// numbers it hands over — the chainage of a leg's two stations — mean nothing
// except against it. A front end accumulating great-circle distance instead
// would build a subtly different scale and slide every stub along its line,
// more the longer the alignment, with nothing anywhere to notice.
//
// `src/fixtures/chainage.golden.json` is a byte-for-byte copy of the API's own
// fixture and is what holds the two implementations together: change the
// projection or the radius on either side and both test suites go red.
//
// The frame trades geodesic exactness for local self-consistency, which is what
// a chainage actually needs: the same answer whether you sum the pieces or
// measure the whole.

const EARTH_RADIUS_M = 6371000

const toRad = (deg: number): number => (deg * Math.PI) / 180

// The reference latitude is the mean of the line's own vertices — the whole
// line's, not each leg's — because that is the frame the API measured in, and
// a per-leg reference would produce a metric that disagreed with itself
// depending on where you started walking.
export function chainageAlong(coordinates: [number, number][]): number[] {
  if (coordinates.length === 0) return []

  const refLatRad = toRad(
    coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length,
  )
  const cosRef = Math.cos(refLatRad)
  const x = (lng: number): number => EARTH_RADIUS_M * toRad(lng) * cosRef
  const y = (lat: number): number => EARTH_RADIUS_M * toRad(lat)

  const out = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const [aLng, aLat] = coordinates[i - 1]
    const [bLng, bLat] = coordinates[i]
    out.push(out[i - 1] + Math.hypot(x(bLng) - x(aLng), y(bLat) - y(aLat)))
  }
  return out
}

// `fromChainageM` and `toChainageM` are the two stations' positions along this
// alignment, straight off the compiled edge. They may descend — a hop running
// against the direction the alignment was drawn in — and that needs no special
// case: the cut is `from + fraction * (to - from)` either way, and the result is
// simply walked out in the direction of travel, so it always begins at the
// station the rider left and ends where their budget ran out. A caller drawing
// a cap marker wants the last coordinate, whichever way the line runs.
//
// Interpolation within a leg is linear in degrees, which is exactly linear in
// the planar frame above: the projection scales each axis by a constant, so the
// same parameter picks the same point in both.
//
// Returns an empty line rather than throwing for anything undrawable — a zero
// fraction, a degenerate span, a line with no length. A chainage past the end
// of the alignment is clamped to it, so a stub stops where the geometry does
// rather than being dropped: progress is decoration, and the map failing to
// draw a station's leg is a far smaller fault than the map failing.
//
// The fraction is clamped to 0…1 here rather than trusted. The worker clamps it
// too, but this module makes a promise about undrawable input and a fraction
// above 1 would quietly break it in the worst direction: the stub would run
// *past* the station the rider never reached, and the cap marking where the
// budget ran out would be planted beyond it.
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
