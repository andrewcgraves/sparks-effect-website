import { watch } from 'vue'
import type { Map } from 'maplibre-gl'

export interface MapModule {
  deps: () => unknown

  isReady: (styleLoaded: boolean) => boolean

  attach: (map: Map) => void

  sync: (map: Map) => void

  detach: () => void
}

export function mapModules(modules: readonly MapModule[]) {
  const attached = new Set<MapModule>()

  // Null until the owner has a map to attach to. Readiness is held rather than
  // passed because the per-module watchers below fire between the owner's
  // calls, and need to know whether the style has come up since.
  let map: Map | null = null
  let styleLoaded = false

  function apply(module: MapModule): void {
    if (!map) return
    if (attached.has(module)) {
      module.sync(map)
      return
    }
    if (!module.isReady(styleLoaded)) return
    // attach seeds the module with current data, so it is not also synced on
    // the turn it attaches — that would apply the same data twice.
    module.attach(map)
    attached.add(module)
  }

  for (const module of modules) {
    watch(module.deps, () => apply(module))
  }

  // Called when the map is created and again once its style has loaded — the
  // second call is what lets everything that had to wait for the style attach.
  function sync(target: Map, ready: boolean): void {
    map = target
    styleLoaded = ready
    for (const module of modules) apply(module)
  }

  function detach(): void {
    for (const module of attached) module.detach()
    attached.clear()
    map = null
    styleLoaded = false
  }

  return { sync, detach }
}
