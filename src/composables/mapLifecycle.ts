import type { Map } from 'maplibre-gl'

/** What a module needs to know about the map before it can decide it is ready. */
export interface MapReadiness {
  // Whether the style has finished loading. Sources and layers cannot be added
  // before it has; a Marker can be attached at any point.
  styleLoaded: boolean
}

/**
 * One dynamic thing drawn on the map, in the shape they all share.
 *
 * Before this existed the five of them each had their own: one took its data as
 * arguments and could only ever be added, one returned an `update` handle, one
 * watched a ref of its own, one returned nothing at all and wired listeners as
 * a side effect. MapView made up the difference with a flag per module and a
 * pair of `maybeAdd…` guards it had to remember to call from both the style's
 * load handler and a watcher.
 *
 * The shape is deliberately four small methods rather than a class: what varies
 * between these modules is when they are ready and what they own, not how they
 * are constructed.
 */
export interface MapModule {
  /**
   * Whether this module has both the map state and the data it needs. A module
   * that is not ready is simply skipped, and asked again on the next sync — so
   * a layer whose data arrives late attaches when it arrives.
   */
  isReady: (readiness: MapReadiness) => boolean

  /** Adds sources, layers, markers, and listeners. Called at most once. */
  attach: (map: Map) => void

  /** Re-applies current data to an already-attached module. */
  sync: (map: Map) => void

  /**
   * Releases anything that would outlive the map: window listeners, Vue
   * watchers, DOM markers.
   *
   * Sources and layers are deliberately not removed here. They belong to the
   * map, and the map is torn down immediately after — removing them one by one
   * first would be ceremony with a real failure mode, since a module that is
   * asked to remove a layer it never added has to guess.
   */
  detach: () => void
}

/**
 * Drives a fixed, ordered list of map modules through one lifecycle.
 *
 * The order of the list is the dependency order and is load-bearing: stop
 * dragging binds its listeners to the layer the stop preview creates, so the
 * preview is listed first. That used to be an implicit property of which line
 * came first inside a `maybeInit…` function.
 *
 * This owns the only thing MapView was keeping flags for — whether each module
 * has been attached yet — and it is a Set of modules rather than a boolean per
 * module, so adding a sixth module adds no state anywhere.
 */
export function mapModules(modules: readonly MapModule[]) {
  const attached = new Set<MapModule>()

  /** Attaches whatever has become ready, and re-syncs whatever already was. */
  function sync(map: Map, readiness: MapReadiness): void {
    for (const module of modules) {
      if (attached.has(module)) {
        module.sync(map)
        continue
      }
      if (!module.isReady(readiness)) continue
      // attach seeds the module with current data, so it is not also synced on
      // the turn it attaches — that would apply the same data twice.
      module.attach(map)
      attached.add(module)
    }
  }

  function detach(): void {
    for (const module of attached) module.detach()
    attached.clear()
  }

  return { sync, detach }
}
