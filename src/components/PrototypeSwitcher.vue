<script setup lang="ts">
// PROTOTYPE — dev-only variant switcher. Cycles `?variant=` with the arrows or
// ← / →. Mounted from App.vue behind import.meta.env.DEV.
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  label: string
  variants: { key: string; name: string }[]
  modelValue: string
}>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const route = useRoute()
const router = useRouter()

const index = computed(() => Math.max(0, props.variants.findIndex((v) => v.key === props.modelValue)))
const current = computed(() => props.variants[index.value])

watch(
  () => route.query.variant,
  (key) => {
    const found = props.variants.find((v) => v.key === key)
    emit('update:modelValue', found ? found.key : props.variants[0].key)
  },
  { immediate: true },
)

function step(by: number): void {
  const n = props.variants.length
  const next = props.variants[(index.value + by + n) % n]
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  const target = event.target as HTMLElement | null
  // Inputs keep their caret, and a focused map keeps its arrow-key panning.
  if (target?.closest('input, textarea, select, [contenteditable], .maplibregl-map')) return
  step(event.key === 'ArrowLeft' ? -1 : 1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-1 py-1 font-mono text-sm text-white shadow-(--shadow-panel) ring-2 ring-yellow-300"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="rounded-full px-3 py-1 hover:bg-ink-muted"
      aria-label="Previous variant"
      @click="step(-1)"
    >
      ←
    </button>
    <span class="px-2 whitespace-nowrap">{{ label }}: {{ current.key }} ({{ current.name }})</span>
    <button
      type="button"
      class="rounded-full px-3 py-1 hover:bg-ink-muted"
      aria-label="Next variant"
      @click="step(1)"
    >
      →
    </button>
  </div>
</template>
