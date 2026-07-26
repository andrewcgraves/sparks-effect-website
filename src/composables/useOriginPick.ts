import { ref, useTemplateRef } from 'vue'
import type IsochroneForm from '../IsochroneForm.vue'
import type { SnapCoord as LatLng } from '../api/authoring/types'

// The template ref each surface must put on its IsochroneForm for the relay
// below to find it.
export const ISOCHRONE_FORM_REF = 'isochroneForm'

// Picking the isochrone origin off the map is split across two siblings: the
// form owns the armed state and the coordinates, the map draws the crosshair
// and reports the click. Neither can reach the other, so every page that puts
// the two side by side needs this same relay — armed flag out to the map, the
// clicked point back into the form.
export function useOriginPick() {
  const pickArmed = ref(false)
  const form = useTemplateRef<InstanceType<typeof IsochroneForm>>(ISOCHRONE_FORM_REF)

  function onMapClick(coord: LatLng): void {
    form.value?.setOriginFromMap(coord)
  }

  return { pickArmed, onMapClick }
}
