<script setup lang="ts">
// PROTOTYPE (throwaway): "Plot your own" layout variants on the network page.
// Plan: three alternatives to the current IsochroneForm (A), switchable via
// ?variant=A|B|C|D|E on /scenario/:slug, same props/events/exposed methods.
import { computed, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'
import IsochroneForm from '../../IsochroneForm.vue'
import PrototypeSwitcher from '../../components/PrototypeSwitcher.vue'
import VariantBOneField from './VariantBOneField.vue'
import VariantCSentence from './VariantCSentence.vue'
import VariantDMapFirst from './VariantDMapFirst.vue'
import VariantEMerged from './VariantEMerged.vue'
import type { IsochronePayload } from '../../isochroneQuery'

defineOptions({ inheritAttrs: false })

const VARIANTS: { key: string; name: string; component: Component }[] = [
  { key: 'A', name: 'Current form', component: IsochroneForm },
  { key: 'B', name: 'One starting-point field', component: VariantBOneField },
  { key: 'C', name: 'Sentence', component: VariantCSentence },
  { key: 'D', name: 'Map first, tiles + slider', component: VariantDMapFirst },
  { key: 'E', name: 'B field + D tiles + B times', component: VariantEMerged },
]

const route = useRoute()
const current = computed(() => VARIANTS.find((v) => v.key === route.query.variant) ?? VARIANTS[0])

type FormHandle = {
  setOriginFromMap: (c: { lat: number; lng: number }) => void
  fill: (p: IsochronePayload) => void
}
const inner = ref<FormHandle | null>(null)

defineExpose({
  setOriginFromMap: (c: { lat: number; lng: number }) => inner.value?.setOriginFromMap(c),
  fill: (p: IsochronePayload) => inner.value?.fill(p),
})
</script>

<template>
  <component
    :is="current.component"
    :key="current.key"
    ref="inner"
    v-bind="$attrs"
  />
  <PrototypeSwitcher :variants="VARIANTS" />
</template>
