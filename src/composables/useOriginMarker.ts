import { Marker, type Map } from 'maplibre-gl'
import { watch, type Ref } from 'vue'

export function useOriginMarker(
  map: Map,
  origin: Ref<{ lat: number; lng: number } | null | undefined>,
): void {
  const marker = new Marker()

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
