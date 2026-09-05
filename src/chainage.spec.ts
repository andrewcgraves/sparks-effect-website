import { describe, it, expect } from 'vitest'
import { chainageAlong, sliceAlignment } from './chainage'
import chainageFixture from './fixtures/chainage.golden.json'

/**
 * The alignment from the shared fixture, and the chainages the API says each of
 * its vertices sits at.
 *
 * This file is a byte-for-byte copy of sparks-effect-api's
 * `internal/physics/testdata/chainage.golden.json`, and both sides assert
 * against it. That is the whole reason it exists: the API hands this front end
 * two chainages measured in its own planar frame, and a front end accumulating
 * a different metric would produce a scale that quietly disagrees — visibly so
 * on a long alignment, and with nothing to catch it. Change the projection or
 * the Earth radius on either side and both suites go red.
 */
const line = chainageFixture.line as [number, number][]
const expectedChainage = chainageFixture.vertex_chainage_m

describe('chainageAlong', () => {
  // Four decimal places is a tenth of a millimetre: far tighter than any
  // rendering difference could be, and loose enough that the fixture can carry
  // human-readable numbers.
  it('agrees with the API on every vertex of the shared fixture', () => {
    const got = chainageAlong(line)
    expect(got).toHaveLength(expectedChainage.length)
    got.forEach((m, i) => expect(m).toBeCloseTo(expectedChainage[i], 4))
  })

  it('starts at zero and never goes backwards', () => {
    const got = chainageAlong(line)
    expect(got[0]).toBe(0)
    for (let i = 1; i < got.length; i++) expect(got[i]).toBeGreaterThan(got[i - 1])
  })

  it('is not haversine', () => {
    // The equirectangular frame is about the whole line's mean latitude, so a
    // due-east leg high on the line is measured with the cosine of 38.225°
    // rather than of its own 37.2°. A haversine walk would use the latter and
    // come out around 30 m longer over this leg — small, and exactly the kind
    // of quiet scale error that would slide a stub along a 400 km alignment.
    const got = chainageAlong(line)
    const eastLeg = got[2] - got[1]
    const haversineish = 6371000 * (0.2 * Math.PI) / 180 * Math.cos((37.2 * Math.PI) / 180)
    expect(Math.abs(eastLeg - haversineish)).toBeGreaterThan(1)
  })

  it('has one entry for a degenerate single-vertex line', () => {
    expect(chainageAlong([[-122, 37]])).toEqual([0])
  })
})

describe('sliceAlignment', () => {
  // The whole fixture line, cut at half its length. The cut lands on the third
  // leg, which runs due north from (-121.8, 37.2).
  const wholeLine = { from: 0, to: expectedChainage[3] }

  /**
   * Half the fixture line lands partway along its middle leg, which runs due
   * east from vertex 1 to vertex 2. Where exactly is derived here from the
   * fixture's own chainages rather than re-measured off the returned span:
   * chainage is defined against the *whole* line's mean latitude, so walking a
   * slice in its own frame is a different measurement and would disagree by
   * metres — correctly, and confusingly.
   */
  const cutPointAtHalf = (): [number, number] => {
    const cutM = wholeLine.to * 0.5
    const t = (cutM - expectedChainage[1]) / (expectedChainage[2] - expectedChainage[1])
    return [-122.0 + t * 0.2, 37.2]
  }

  it('returns the span from the start station to the cut point', () => {
    const got = sliceAlignment(line, wholeLine.from, wholeLine.to, 0.5)
    expect(got[0]).toEqual([-122.0, 37.0])

    const [wantLng, wantLat] = cutPointAtHalf()
    const end = got[got.length - 1]
    expect(end[0]).toBeCloseTo(wantLng, 9)
    expect(end[1]).toBeCloseTo(wantLat, 9)

    // Every vertex the span crosses is kept, so the stub follows the railway
    // rather than cutting the corner at vertex 1.
    expect(got).toContainEqual([-122.0, 37.2])
  })

  it('draws nothing at a fraction of zero and the whole span at one', () => {
    expect(sliceAlignment(line, wholeLine.from, wholeLine.to, 0)).toEqual([])

    const whole = sliceAlignment(line, wholeLine.from, wholeLine.to, 1)
    expect(whole[0]).toEqual([-122.0, 37.0])
    expect(whole[whole.length - 1]).toEqual([-121.8, 37.5])
  })

  /**
   * A hop running against the direction its alignment was drawn in has a higher
   * from-chainage than to-chainage. That is an authoring detail the rider never
   * sees and must not be a special case: the stub still starts at the station
   * the rider left and still ends at the point their budget reached.
   */
  it('handles descending chainage without a special case', () => {
    const got = sliceAlignment(line, wholeLine.to, wholeLine.from, 0.5)
    expect(got[0]).toEqual([-121.8, 37.5])

    const [wantLng, wantLat] = cutPointAtHalf()
    const end = got[got.length - 1]
    expect(end[0]).toBeCloseTo(wantLng, 9)
    expect(end[1]).toBeCloseTo(wantLat, 9)
  })

  it('draws the mirror image of an ascending slice', () => {
    const up = sliceAlignment(line, wholeLine.from, wholeLine.to, 1)
    const down = sliceAlignment(line, wholeLine.to, wholeLine.from, 1)
    expect(down).toEqual([...up].reverse())
  })

  it('slices a span that is only part of the alignment', () => {
    // The middle leg alone: vertex 1 to vertex 2, cut at 40%.
    const got = sliceAlignment(line, expectedChainage[1], expectedChainage[2], 0.4)
    expect(got[0][0]).toBeCloseTo(-122.0, 9)
    expect(got[0][1]).toBeCloseTo(37.2, 9)
    expect(got[got.length - 1][1]).toBeCloseTo(37.2, 9)
    // 40% of the way east along a leg spanning 0.2° of longitude.
    expect(got[got.length - 1][0]).toBeCloseTo(-122.0 + 0.4 * 0.2, 6)
  })

  it('draws nothing for a degenerate span', () => {
    expect(sliceAlignment(line, 1000, 1000, 0.5)).toEqual([])
  })

  it('draws nothing when the line has no length to slice', () => {
    expect(sliceAlignment([[-122, 37]], 0, 100, 0.5)).toEqual([])
    expect(sliceAlignment([], 0, 100, 0.5)).toEqual([])
  })

  /**
   * The worker clamps the fraction too, but this module promises an empty line
   * for anything undrawable, and a fraction above 1 would break that in the
   * worst direction: a stub running past the station the rider never reached,
   * with the cap marking where their budget ran out planted beyond it.
   */
  it('never draws past the destination, whatever fraction it is handed', () => {
    const whole = sliceAlignment(line, wholeLine.from, wholeLine.to, 1)
    expect(sliceAlignment(line, wholeLine.from, wholeLine.to, 1.5)).toEqual(whole)
    expect(sliceAlignment(line, wholeLine.from, wholeLine.to, -0.5)).toEqual([])
  })

  it('draws nothing for a span too short for the coordinates to express', () => {
    // Sub-float-resolution: both ends resolve to the same point, and a
    // zero-length line would still plant a cap with nothing underneath it.
    expect(sliceAlignment(line, 1000, 1000.0000000001, 1)).toEqual([])
  })

  it('clamps a span that runs past the end of the alignment', () => {
    // A chainage beyond the line's own length cannot be drawn to, and returning
    // a truncated span is better than a wrong one: the stub simply stops where
    // the geometry does.
    const got = sliceAlignment(line, 0, expectedChainage[3] * 2, 1)
    expect(got[got.length - 1]).toEqual([-121.8, 37.5])
  })
})
