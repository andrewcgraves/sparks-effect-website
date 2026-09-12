import { ref, useTemplateRef } from 'vue'
import type IsochroneForm from '../IsochroneForm.vue'
import type { SnapCoord as LatLng } from '../api/authoring/types'

export function useOriginPick() {
  const pickArmed = ref(false)
  // Callers must hard-code ref="isochroneForm": Vue cannot bind a static
  // template ref to an imported const.
  const form = useTemplateRef<InstanceType<typeof IsochroneForm>>('isochroneForm')

  function onMapClick(coord: LatLng): void {
    form.value?.setOriginFromMap(coord)
  }

  return { pickArmed, onMapClick }
}
