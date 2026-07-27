import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import type { Map } from 'maplibre-gl'
import { mapModules, type MapModule } from './mapLifecycle'

const map = {} as Map

// A module that records what it was asked to do, and can be told when it is
// ready — which is the only thing that varies between the real five.
function fake(options: { ready?: boolean; label?: string; log?: string[] } = {}) {
  const log = options.log ?? []
  let ready = options.ready ?? true
  const label = options.label ?? 'module'
  const module: MapModule = {
    deps: () => ready,
    isReady: (styleLoaded) => styleLoaded && ready,
    attach: () => log.push(`${label}:attach`),
    sync: () => log.push(`${label}:sync`),
    detach: () => log.push(`${label}:detach`),
  }
  return { module, log, becomeReady: () => { ready = true } }
}

describe('mapModules', () => {
  it('attaches a ready module once, then syncs it', () => {
    const { module, log } = fake()
    const modules = mapModules([module])

    modules.sync(map, true)
    modules.sync(map, true)
    modules.sync(map, true)

    expect(log).toEqual(['module:attach', 'module:sync', 'module:sync'])
  })

  // attach seeds the module with current data, so syncing on the same turn
  // would apply it twice.
  it('does not sync a module on the turn it attaches', () => {
    const { module, log } = fake()
    mapModules([module]).sync(map, true)
    expect(log).toEqual(['module:attach'])
  })

  it('leaves a module alone until the style has loaded', () => {
    const { module, log } = fake()
    const modules = mapModules([module])

    modules.sync(map, false)
    expect(log).toEqual([])

    modules.sync(map, true)
    expect(log).toEqual(['module:attach'])
  })

  // A layer whose data arrives from a fetch has nothing to draw at load time;
  // it must still attach when the data turns up.
  it('attaches a module that only becomes ready later', () => {
    const { module, log, becomeReady } = fake({ ready: false })
    const modules = mapModules([module])

    modules.sync(map, true)
    expect(log).toEqual([])

    becomeReady()
    modules.sync(map, true)
    expect(log).toEqual(['module:attach'])
  })

  // Stop dragging binds to the layer the stop preview creates, so list order
  // is the dependency order.
  it('attaches in list order', () => {
    const log: string[] = []
    const first = fake({ label: 'preview', log })
    const second = fake({ label: 'drag', log })

    mapModules([first.module, second.module]).sync(map, true)

    expect(log).toEqual(['preview:attach', 'drag:attach'])
  })

  it('detaches everything it attached', () => {
    const log: string[] = []
    const a = fake({ label: 'a', log })
    const b = fake({ label: 'b', log })
    const modules = mapModules([a.module, b.module])
    modules.sync(map, true)
    log.length = 0

    modules.detach()

    expect(log).toEqual(['a:detach', 'b:detach'])
  })

  // Detaching a module that never attached would ask it to release resources
  // it never acquired.
  it('does not detach a module that never attached', () => {
    const { module, log } = fake({ ready: false })
    const modules = mapModules([module])
    modules.sync(map, true)

    modules.detach()

    expect(log).toEqual([])
  })

  it('re-attaches after a detach rather than assuming it is still attached', () => {
    const { module, log } = fake()
    const modules = mapModules([module])
    modules.sync(map, true)
    modules.detach()
    log.length = 0

    modules.sync(map, true)

    expect(log).toEqual(['module:attach'])
  })

  it('adding a module costs the driver no extra state', () => {
    const log: string[] = []
    const modules = mapModules([
      fake({ label: 'one', log }).module,
      fake({ label: 'two', log }).module,
      fake({ label: 'three', log }).module,
    ])

    modules.sync(map, true)

    expect(log).toEqual(['one:attach', 'two:attach', 'three:attach'])
  })


  // The whole reason each module declares its own deps: moving a stop pin
  // fires on every pointer move, and re-applying the origin marker there would
  // tear its DOM node out and re-append it each time.
  it('re-applies only the module whose own inputs changed', async () => {
    const log: string[] = []
    const pins = ref(0)
    const pinned: MapModule = {
      deps: () => pins.value,
      isReady: (styleLoaded) => styleLoaded,
      attach: () => log.push('pins:attach'),
      sync: () => log.push('pins:sync'),
      detach: vi.fn(),
    }
    const bystander = fake({ label: 'bystander', log })
    const modules = mapModules([pinned, bystander.module])
    modules.sync(map, true)
    log.length = 0

    pins.value += 1
    await nextTick()

    expect(log).toEqual(['pins:sync'])
  })

  it('asks an unready module again on every sync', () => {
    const isReady = vi.fn().mockReturnValue(false)
    const modules = mapModules([{ deps: () => 0, isReady, attach: vi.fn(), sync: vi.fn(), detach: vi.fn() }])

    modules.sync(map, true)
    modules.sync(map, true)

    expect(isReady).toHaveBeenCalledTimes(2)
  })
})
