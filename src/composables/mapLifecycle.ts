import { watch } from 'vue'
import type { Map } from 'maplibre-gl'

/**
 * One dynamic thing drawn on the map, in the shape they all share.
 *
 * Before this existed the five of them each had their own, and MapView made up
 * the difference with a flag per module and a pair of `maybeAdd…` guards it had
 * to remember to call from both the style's load handler and a watcher.
 */
export interface MapModule {
  /**
   * What this module draws from. The driver watches it and re-applies this
   * module alone when it changes, so moving a stop pin does not also make the
   * origin marker and the isochrone re-apply data neither of them has changed.
   */
  deps: () => unknown

  /**
   * Whether the module has both the map state and the data it needs. A module
   * that is not ready is skipped and asked again next time, so a layer whose
   * data arrives from a fetch attaches when it arrives.
   *
   * `styleLoaded` is the one thing they all have to ask about: sources and
   * layers cannot be added before the style is up, though a Marker can.
   */
  isReady: (styleLoaded: boolean) => boolean

  /** Adds sources, layers, markers, and listeners, seeded with current data. */
  attach: (map: Map) => void

  /** Re-applies current data to an already-attached module. */
  sync: (map: Map) => void

  /**
   * Releases anything that would outlive the map: window listeners, DOM
   * markers.
   *
   * Sources and layers are deliberately not removed here. They belong to the
   * map, which is torn down immediately afterwards — removing them one by one
   * first would be ceremony with a real failure mode, since a module asked to
   * remove a layer it never added has to guess.
   */
  detach: () => void
}

/**
 * Drives a fixed, ordered list of map modules through one lifecycle.
 *
 * List order is dependency order and is load-bearing: stop dragging binds its
 * listeners to the layer the stop preview creates, so the preview is listed
 * first. That used to be an implicit property of which line came first inside a
 * `maybeInit…` function.
 *
 * Each module is watched on its own `deps`, so the owner does not maintain a
 * list of which props to watch — adding a module is one entry in one list.
 *
 * Must be called from a component's setup, so the watchers it registers are
 * disposed with that component.
 */
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

  /**
   * Points the modules at a map, and brings them up to date with it. Called
   * when the map is created and again once its style has loaded — the second
   * call is what lets everything that had to wait for the style attach.
   */
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
