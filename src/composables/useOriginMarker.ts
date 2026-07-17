import { Marker, type Map } from 'maplibre-gl'
import { watch, type Ref } from 'vue'
import { readThemeToken } from '../themeTokens'

export function useOriginMarker(
  map: Map,
  origin: Ref<{ lat: number; lng: number } | null | undefined>,
): void {
  /* Without an explicit colour MapLibre uses its own cyan default, the one
     off-brand mark on the map. */
  const marker = new Marker({ color: readThemeToken('--color-coral') })

  watch(
    origin,
    (coords) => {
      if (coords) {
        marker.setLngLat([coords.lng, coords.lat]).addTo(map)
      } else {
        marker.remove()
      }
    },
    { immediate: true },
  )
}
