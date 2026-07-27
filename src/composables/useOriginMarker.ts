import { Marker, type Map } from 'maplibre-gl'
import { readThemeToken } from '../themeTokens'
import type { MapModule } from './mapLifecycle'

/**
 * The origin pin as a map module.
 *
 * Always ready: a Marker is a DOM element positioned over the canvas, not a
 * style layer, so it does not have to wait for the style to load — which is why
 * this one alone attaches at map-creation time.
 *
 * It is the only module that owns something the map's own teardown would not
 * collect, so it is the only one with a detach that does anything.
 */
export function originMarkerModule(origin: () => { lat: number; lng: number } | null | undefined): MapModule {
  /* Without an explicit colour MapLibre uses its own cyan default, the one
     off-brand mark on the map. */
  const marker = new Marker({ color: readThemeToken('--color-coral') })

  function place(map: Map): void {
    const coords = origin()
    if (coords) marker.setLngLat([coords.lng, coords.lat]).addTo(map)
    else marker.remove()
  }

  return {
    isReady: () => true,
    attach: place,
    sync: place,
    detach: () => marker.remove(),
  }
}
