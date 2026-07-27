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
  const drag = useStopDrag(mock.map as unknown as Map, { onDrag, onDragEnd, idleCursor })
  return { ...mock, onDrag, onDragEnd, drag }
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

  // MapLibre fires its own mouseup only for releases over the canvas, so a pin
  // dragged past the map's edge and dropped would otherwise leave the drag
  // open forever — and every consumer waiting on the drop with it.
  it('ends the drag when the pointer is released outside the map', () => {
    const { canvas, fire, onDragEnd } = setup(() => 'crosshair')

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    fire('mousemove', null, moveEvent(37.8, -122.4))
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(onDragEnd.mock.calls).toEqual([['0', { lat: 37.8, lng: -122.4 }]])
    expect(canvas.style.cursor).toBe('crosshair')
  })

  it('settles at the last position seen, then accepts a new drag', () => {
    const { fire, onDrag, onDragEnd } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    fire('mousemove', null, moveEvent(37.8, -122.4))
    window.dispatchEvent(new MouseEvent('mouseup'))
    onDrag.mockClear()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('1', 37.33, -121.88))
    fire('mousemove', null, moveEvent(37.4, -121.9))

    expect(onDrag.mock.calls).toEqual([['1', { lat: 37.4, lng: -121.9 }]])
    expect(onDragEnd).toHaveBeenCalledTimes(1)
  })

  it('reports the drop only once when the release also reaches the window', () => {
    const { fire, onDragEnd } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    fire('mousemove', null, moveEvent(37.8, -122.4))
    fire('mouseup', null, moveEvent(37.85, -122.35))
    window.dispatchEvent(new MouseEvent('mouseup'))

    expect(onDragEnd.mock.calls).toEqual([['0', { lat: 37.85, lng: -122.35 }]])
  })

  // Otherwise clicking a pin would rewrite its coordinates to whatever point
  // sits under the cursor, nudging the stop by a few metres per click.
  it('does not report a drop for a press that never moved', () => {
    const { fire, onDragEnd } = setup()

    fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('0', 37.77, -122.41))
    fire('mouseup', null, moveEvent(37.771, -122.411))

    expect(onDragEnd).not.toHaveBeenCalled()
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

  // A drag registers listeners on window, which outlive the map. Leaving the
  // page mid-drag used to strand them holding this closure — and the map with
  // it — for the rest of the session.
  describe('release', () => {
    it('removes the window listeners a drag in flight had registered', () => {
      const added = vi.spyOn(window, 'addEventListener')
      const removed = vi.spyOn(window, 'removeEventListener')
      const { fire, drag } = setup()

      fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('s1', 37.7, -122.4))
      const registered = added.mock.calls.map(([type]) => type)
      expect(registered).toEqual(expect.arrayContaining(['mouseup', 'touchend', 'touchcancel']))

      drag.release()

      const released = removed.mock.calls.map(([type]) => type)
      expect(released).toEqual(expect.arrayContaining(['mouseup', 'touchend', 'touchcancel']))
      added.mockRestore()
      removed.mockRestore()
    })

    // Releasing abandons the gesture rather than completing it: the pointer is
    // gone, and reporting a drop the user never made would move a stop.
    it('does not report a drop for the drag it abandoned', () => {
      const { fire, drag, onDragEnd } = setup()
      fire('mousedown', RAW_STOP_LAYER_ID, pinEvent('s1', 37.7, -122.4))
      fire('mousemove', null, moveEvent(37.8, -122.5))

      drag.release()

      expect(onDragEnd).not.toHaveBeenCalled()
    })
  })
})
