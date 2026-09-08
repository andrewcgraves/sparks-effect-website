import { ref, useTemplateRef } from 'vue'
import type IsochroneForm from '../IsochroneForm.vue'
import type { SnapCoord as LatLng } from '../api/authoring/types'

export const ISOCHRONE_FORM_REF = 'isochroneForm'

export function useOriginPick() {
  const pickArmed = ref(false)
  const form = useTemplateRef<InstanceType<typeof IsochroneForm>>(ISOCHRONE_FORM_REF)

  function onMapClick(coord: LatLng): void {
    form.value?.setOriginFromMap(coord)
  }

  return { pickArmed, onMapClick }
}
