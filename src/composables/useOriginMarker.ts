import { Marker, type Map } from 'maplibre-gl'
import { readThemeToken } from '../themeTokens'
import type { MapModule } from './mapLifecycle'

export function originMarkerModule(origin: () => { lat: number; lng: number } | null | undefined): MapModule {
  // Without an explicit colour MapLibre uses its own cyan default, the one
  // off-brand mark on the map.
  const marker = new Marker({ color: readThemeToken('--color-coral') })

  function place(map: Map): void {
    const coords = origin()
    if (coords) marker.setLngLat([coords.lng, coords.lat]).addTo(map)
    else marker.remove()
  }

  return {
    deps: origin,
    isReady: () => true,
    attach: place,
    sync: place,
    detach: () => marker.remove(),
  }
}
