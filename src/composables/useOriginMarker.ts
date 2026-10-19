import type { Map } from 'maplibre-gl'
import { currentPinVariant, pinVariantKey } from '../prototype/pinVariants'
import type { MapModule } from './mapLifecycle'

export function originMarkerModule(origin: () => { lat: number; lng: number } | null | undefined): MapModule {
  // PROTOTYPE: the marker is rebuilt when `?variant=` changes. Variant A is the
  // shipped one — MapLibre's teardrop in coral, since without an explicit
  // colour MapLibre uses its own cyan default, the one off-brand mark on the map.
  let builtFor = pinVariantKey.value
  let marker = currentPinVariant().build()

  function place(map: Map): void {
    if (builtFor !== pinVariantKey.value) {
      marker.remove()
      builtFor = pinVariantKey.value
      marker = currentPinVariant().build()
    }
    const coords = origin()
    if (coords) marker.setLngLat([coords.lng, coords.lat]).addTo(map)
    else marker.remove()
  }

  return {
    deps: () => [origin(), pinVariantKey.value],
    isReady: () => true,
    attach: place,
    sync: place,
    detach: () => marker.remove(),
  }
}
