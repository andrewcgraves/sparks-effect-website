// PROTOTYPE — throwaway. The variant list and the current choice, kept free of
// maplibre-gl so App.vue can mount the switcher without pulling the map into
// the first chunk. The renderings themselves live in pinVariants.ts.
import { ref } from 'vue'

export const PIN_VARIANT_NAMES = [
  { key: 'A', name: 'Teardrop (current)' },
  { key: 'B', name: 'Bullseye' },
  { key: 'C', name: 'Labelled flag' },
  { key: 'D', name: 'Crosshair' },
]

export const pinVariantKey = ref(PIN_VARIANT_NAMES[0].key)
