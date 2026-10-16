<script setup lang="ts">
// PROTOTYPE switcher — throwaway, dev builds only. Cycles ?variant= on the
// current route so a variant is shareable and survives reload.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ variants: { key: string; name: string }[] }>()

const route = useRoute()
const router = useRouter()

const index = computed(() => {
  const found = props.variants.findIndex((v) => v.key === route.query.variant)
  return found < 0 ? 0 : found
})
const current = computed(() => props.variants[index.value])

function go(step: number): void {
  const next = props.variants[(index.value + step + props.variants.length) % props.variants.length]
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  if (event.key === 'ArrowLeft') go(-1)
  else if (event.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-700 px-2 py-1 font-mono text-sm text-white shadow-lg ring-2 ring-white"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Previous variant"
      @click="go(-1)"
    >
      ←
    </button>
    <span class="px-2 whitespace-nowrap">PROTO · {{ current.key }}<span class="max-sm:hidden"> ({{ current.name }})</span></span>
    <button
      type="button"
      class="rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Next variant"
      @click="go(1)"
    >
      →
    </button>
  </div>
</template>
