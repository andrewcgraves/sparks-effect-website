import { describe, expect, it } from 'vitest'
import {
  placeTooltip,
  tooltipContent,
  tooltipStyle,
  TOOLTIP_GAP_PX,
  TOOLTIP_PANEL_CLASS,
  TOOLTIP_ROOM_PX,
  TOOLTIP_WIDTH_PX,
} from './tooltip'

const viewport = { width: 800, height: 600 }

describe('placeTooltip', () => {
  it('opens below the anchor, left-aligned, when there is room underneath', () => {
    const placement = placeTooltip(
      { top: 100, right: 200, bottom: 130, left: 50 },
      viewport,
    )

    expect(placement).toEqual({
      left: 50,
      width: TOOLTIP_WIDTH_PX,
      top: 130 + TOOLTIP_GAP_PX,
    })
  })

  it('flips above the anchor when the foot of the viewport is closer than the box is tall', () => {
    const placement = placeTooltip(
      { top: 500, right: 200, bottom: 530, left: 50 },
      viewport,
    )

    expect(placement.top).toBeUndefined()
    expect(placement.bottom).toBe(viewport.height - 500 + TOOLTIP_GAP_PX)
  })

  it('stays below when there is little room underneath but even less above', () => {
    const placement = placeTooltip(
      { top: 40, right: 200, bottom: viewport.height - 60, left: 50 },
      viewport,
    )

    expect(placement.bottom).toBeUndefined()
    expect(placement.top).toBe(viewport.height - 60 + TOOLTIP_GAP_PX)
  })

  it('slides left when left-aligning would cross the right edge of the viewport', () => {
    const placement = placeTooltip(
      { top: 100, right: 790, bottom: 130, left: 700 },
      viewport,
    )

    expect(placement.left).toBe(viewport.width - TOOLTIP_WIDTH_PX - TOOLTIP_GAP_PX)
  })

  it('stays clear of the left edge when the anchor sits against it', () => {
    const placement = placeTooltip(
      { top: 100, right: 80, bottom: 130, left: 4 },
      viewport,
    )

    expect(placement.left).toBe(TOOLTIP_GAP_PX)
  })

  it('honours a caller-chosen width when clamping to the right edge', () => {
    const width = 120
    const placement = placeTooltip(
      { top: 100, right: 790, bottom: 130, left: 700 },
      viewport,
      width,
    )

    expect(placement.width).toBe(width)
    expect(placement.left).toBe(viewport.width - width - TOOLTIP_GAP_PX)
  })

  it('uses the room threshold, not the box height, to decide a flip', () => {
    // Just inside the threshold: 139px below, plenty above.
    const bottom = viewport.height - (TOOLTIP_ROOM_PX - 1)
    const placement = placeTooltip(
      { top: 200, right: 200, bottom, left: 50 },
      viewport,
    )

    expect(placement.top).toBeUndefined()
    expect(placement.bottom).toBeDefined()
  })
})

describe('tooltipStyle', () => {
  it('renders the below-anchor placement as top/left/width', () => {
    expect(tooltipStyle({ left: 50, width: 240, top: 138 })).toEqual({
      left: '50px',
      width: '240px',
      top: '138px',
    })
  })

  it('renders the above-anchor placement as bottom/left/width', () => {
    expect(tooltipStyle({ left: 50, width: 240, bottom: 108 })).toEqual({
      left: '50px',
      width: '240px',
      bottom: '108px',
    })
  })
})

describe('tooltipContent', () => {
  it('puts the text in a node wearing the panel recipe', () => {
    const node = tooltipContent('San Francisco')

    expect(node.textContent).toBe('San Francisco')
    expect(node.className).toContain(TOOLTIP_PANEL_CLASS)
    expect(node.className).toContain('font-body')
  })
})
