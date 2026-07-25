import { describe, it, expect, vi } from 'vitest'
import type { Map } from 'maplibre-gl'
import { useStopDrag } from './useStopDrag'
import { RAW_STOP_LAYER_ID } from './useStopPreviewLayer'

type Handler = (event: unknown) => void

// Records the handlers useStopDrag registers so tests can fire MapLibre events
// at it. Layer-scoped registrations carry a layer id; map-wide ones don't.
function makeMockMap() {
  const handlers: { type: string; layer: string | null; handler: Handler; once: boolean }[] = []
  const canvas = { style: { cursor: '' } }

  function register(once: boolean) {
    return vi.fn((type: string, layerOrHandler: string | Handler, maybeHandler?: Handler) => {
      if (typeof layerOrHandler === 'function') {
        handlers.push({ type, layer: null, handler: layerOrHandler, once })
      } else {
        handlers.push({ type, layer: layerOrHandler, handler: maybeHandler as Handler, once })
      }
    })
  }

  const map = {
    on: register(false),
    once: register(true),
    off: vi.fn((type: string, layerOrHandler: string | Handler, maybeHandler?: Handler) => {
      const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler
      const index = handlers.findIndex((h) => h.type === type && h.handler === handler)
      if (index >= 0) handlers.splice(index, 1)
    }),
    getCanvas: () => canvas,
  }

  function fire(type: string, layer: string | null, event: unknown = {}) {
    const matches = handlers.filter((h) => h.type === type && h.layer === layer)
    for (const match of matches) {
      if (match.once) handlers.splice(handlers.indexOf(match), 1)
      match.handler(event)
    }
    return matches.length
  }

  return { map, canvas, fire, handlers }
}

function pinEvent(id: string, lat: number, lng: number) {
  return {
    features: [{ properties: { id } }],
    lngLat: { lat, lng },
    points: [{ x: 1, y: 1 }],
    preventDefault: vi.fn(),
  }
}

function moveEvent(lat: number, lng: number) {
  return { lngLat: { lat, lng }, points: [{ x: 1, y: 1 }], preventDefault: vi.fn() }
}

function setup(idleCursor = () => '') {
  const onDrag = vi.fn()
  const onDragEnd = vi.fn()
  const mock = makeMockMap()
  useStopDrag(mock.map as unknown as Map, { onDrag, onDragEnd, idleCursor })
  return { ...mock, onDrag, onDragEnd }
}

describe('useStopDrag', () => {
  it('shows a grab cursor while the pointer is over a pin', () => {
    const { canvas, fire } = setup()

    fire('mouseenter', RAW_STOP_LAYER_ID)
    expect(canvas.style.cursor).toBe('grab')

    fire('mouseleave', RAW_STOP_LAYER_ID)
    expect(canvas.style.cursor).toBe('')
  })

  it('restores the caller-owned idle cursor on leave, not a hardcoded default', () => {
    const { canvas, fire } = setup(() => 'crosshair')

    fire('mouseenter', RAW_STOP_LAYER_ID)
    fire('mouseleave', RAW_STOP_LAYER_ID)

    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('claims the gesture on mousedown so the map does not pan underneath the pin', () => {
    const { fire, handlers } = setup()
    const down = pinEvent('0', 37.77, -122.41)

    fire('mousedown', RAW_STOP_LAYER_ID, down)

    expect(down.preventDefault).toHaveBeenCalled()
    expect(handlers.some((h) => h.type === 'mousemove' && h.layer === null)).toBe(true)
  })

  it('reports pointer positions during the drag against the pin id', () => {
    const { fire, onDrag, onDragEnd } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('1', 37.77, -122.41))
    fire('mousemove', null, moveEvent(37.8, -122.4))
    fire('mousemove', null, moveEvent(37.9, -122.3))

    expect(onDrag.mock.calls).toEqual([
      ['1', { lat: 37.8, lng: -122.4 }],
      ['1', { lat: 37.9, lng: -122.3 }],
    ])
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('reports the drop position once, on mouseup', () => {
    const { fire, onDragEnd } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('2', 37.77, -122.41))
    fire('mousemove', null, moveEvent(37.8, -122.4))
    fire('mouseup', null, moveEvent(37.85, -122.35))

    expect(onDragEnd.mock.calls).toEqual([['2', { lat: 37.85, lng: -122.35 }]])
  })

  it('stops reporting moves once the drag has ended', () => {
    const { fire, onDrag } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    fire('mouseup', null, moveEvent(37.8, -122.4))
    onDrag.mockClear()

    fire('mousemove', null, moveEvent(38.5, -121.0))

    expect(onDrag).not.toHaveBeenCalled()
  })

  it('restores the idle cursor after the drop', () => {
    const { canvas, fire } = setup(() => 'crosshair')

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    expect(canvas.style.cursor).toBe('grabbing')

    fire('mouseup', null, moveEvent(37.8, -122.4))
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('ignores a press that carries no stop id', () => {
    const { fire, onDrag } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, { features: [], lngLat: { lat: 0, lng: 0 }, preventDefault: vi.fn() })
    fire('mousemove', null, moveEvent(37.8, -122.4))

    expect(onDrag).not.toHaveBeenCalled()
  })

  it('drags with a touch pointer', () => {
    const { fire, onDrag, onDragEnd } = setup()
    const down = pinEvent('3', 37.77, -122.41)

    fire('touchstart', RAW_STOP_LAYER_ID, down)
    fire('touchmove', null, moveEvent(37.8, -122.4))
    fire('touchend', null, moveEvent(37.85, -122.35))

    expect(down.preventDefault).toHaveBeenCalled()
    expect(onDrag.mock.calls).toEqual([['3', { lat: 37.8, lng: -122.4 }]])
    expect(onDragEnd.mock.calls).toEqual([['3', { lat: 37.85, lng: -122.35 }]])
  })

  it('ignores a multi-touch press, leaving pinch-zoom to the map', () => {
    const { fire, onDrag } = setup()

    fire('touchstart', RAW_STOP_LAYER_ID, {
      features: [{ properties: { id: '0' } }],
      lngLat: { lat: 37.77, lng: -122.41 },
      points: [{ x: 1, y: 1 }, { x: 40, y: 40 }],
      preventDefault: vi.fn(),
    })
    fire('touchmove', null, moveEvent(37.8, -122.4))

    expect(onDrag).not.toHaveBeenCalled()
  })
})
