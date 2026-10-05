<script setup lang="ts">
// PROTOTYPE: floating variant switcher. Dev builds only; never ship.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ variants: { key: string, name: string }[] }>()

const route = useRoute()
const router = useRouter()
const show = import.meta.env.DEV && Boolean(route)

const index = computed(() => {
  const at = props.variants.findIndex((v) => v.key === route?.query.variant)
  return at === -1 ? 0 : at
})
const current = computed(() => props.variants[index.value])

function step(by: number): void {
  const n = props.variants.length
  const next = props.variants[(index.value + by + n) % n]
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target
  if (target instanceof Element && target.closest('input, textarea, select, [contenteditable]')) return
  if (event.key === 'ArrowLeft') step(-1)
  if (event.key === 'ArrowRight') step(1)
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div
    v-if="show"
    class="font-body text-caption fixed bottom-24 left-1/2 z-60 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate px-2 py-1.5 text-white shadow-lg ring-2 ring-apricot"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="cursor-pointer rounded-full px-2 hover:bg-white/15"
      aria-label="Previous variant"
      @click="step(-1)"
    >
      ‹
    </button>
    <span class="px-2 whitespace-nowrap">Prototype {{ current.key }}: {{ current.name }}</span>
    <button
      type="button"
      class="cursor-pointer rounded-full px-2 hover:bg-white/15"
      aria-label="Next variant"
      @click="step(1)"
    >
      ›
    </button>
  </div>
</template>
