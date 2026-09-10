import { watch } from 'vue'
import type { Map } from 'maplibre-gl'

export interface MapModule {
  deps: () => unknown

  isReady: (styleLoaded: boolean) => boolean

  attach: (map: Map) => void

  sync: (map: Map) => void

  detach: () => void

  requires?: readonly MapModule[]
}

export function mapModules(modules: readonly MapModule[]) {
  const attached = new Set<MapModule>()

  // Null until the owner has a map to attach to. Readiness is held rather than
  // passed because the per-module watchers below fire between the owner's
  // calls, and need to know whether the style has come up since.
  let map: Map | null = null
  let styleLoaded = false

  function canAttach(module: MapModule): boolean {
    if (attached.has(module) || !map) return false
    if (!module.isReady(styleLoaded)) return false
    // List order used to stand in for this, and silently didn't when the two
    // isReady predicates disagreed — highlight bound to station dots that
    // the route module had not created yet (SPA-292).
    return !module.requires?.some((dep) => !attached.has(dep))
  }

  function tryAttach(module: MapModule): boolean {
    if (!map || !canAttach(module)) return false
    // attach seeds the module with current data, so it is not also synced on
    // the turn it attaches — that would apply the same data twice.
    module.attach(map)
    attached.add(module)
    return true
  }

  function attachReady(): void {
    let progressed = true
    while (progressed) {
      progressed = false
      for (const module of modules) {
        if (tryAttach(module)) progressed = true
      }
    }
  }

  function apply(module: MapModule): void {
    if (!map) return
    if (attached.has(module)) {
      module.sync(map)
      return
    }
    // The module whose deps just flipped may unblock others waiting on it
    // (highlight waiting on the route layer). Walk the whole list rather
    // than attaching only the triggering module.
    attachReady()
  }

  for (const module of modules) {
    watch(module.deps, () => apply(module))
  }

  // Called when the map is created and again once its style has loaded — the
  // second call is what lets everything that had to wait for the style attach.
  function sync(target: Map, ready: boolean): void {
    map = target
    styleLoaded = ready
    const already = new Set(attached)
    for (const module of modules) {
      if (already.has(module)) module.sync(map)
    }
    attachReady()
  }

  function detach(): void {
    for (const module of attached) module.detach()
    attached.clear()
    map = null
    styleLoaded = false
  }

  return { sync, detach }
}
