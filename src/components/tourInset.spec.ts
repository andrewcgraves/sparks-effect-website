import { describe, expect, it } from 'vitest'
import { fitAnchor } from './tourHighlight'
import { NO_INSET, cameraPadding, clearView } from './tourInset'

const box = { ...NO_INSET, left: 428 }
const size = { width: 1440, height: 704 }
const label = { width: 240, height: 48 }

describe('cameraPadding', () => {
  it('keeps the open padding on every side nothing covers', () => {
    expect(cameraPadding(NO_INSET, 24)).toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
  })

  it('frames a covered side from the edge of what covers it', () => {
    expect(cameraPadding(box, 48)).toEqual({ top: 48, right: 48, bottom: 48, left: 452 })
  })
})

describe('clearView', () => {
  it('is the whole map when nothing covers it', () => {
    expect(clearView(NO_INSET, { x: 300, y: 200 }, size)).toEqual({ point: { x: 300, y: 200 }, frame: size })
  })

  it('crosses a label to its point\'s other side rather than under the box', () => {
    const point = { x: 520, y: 300 }
    expect(fitAnchor('right', point, size, label)).toBe('right')
    const clear = clearView(box, point, size)
    expect(clear.frame).toEqual({ width: 1012, height: 704 })
    expect(fitAnchor('right', clear.point, clear.frame, label)).toBe('left')
  })

  it('leans a label centred on a point near the box away from it', () => {
    const clear = clearView(box, { x: 500, y: 300 }, size)
    expect(fitAnchor('top', clear.point, clear.frame, label)).toBe('top-left')
  })
})
