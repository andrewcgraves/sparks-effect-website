<script setup lang="ts">
// PROTOTYPE — throwaway. Floating bar that cycles ?variant= on the current
// route (← / → keys too). Never rendered in a production build.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ variants: { key: string; label: string }[]; current: string }>()

const route = useRoute()
const router = useRouter()
const show = !import.meta.env.PROD

const index = computed(() => Math.max(props.variants.findIndex((v) => v.key === props.current), 0))
const label = computed(() => {
  const v = props.variants[index.value]
  return v ? `${v.key} — ${v.label}` : props.current
})

function go(step: number): void {
  const n = props.variants.length
  const next = props.variants[(index.value + step + n) % n]
  if (next) void router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null
  if (t && (t.closest('input, textarea, select, [contenteditable]'))) return
  if (e.key === 'ArrowLeft') go(-1)
  if (e.key === 'ArrowRight') go(1)
}

onMounted(() => { if (show) window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="show"
    class="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-2 py-1.5 font-mono text-[12px] text-white shadow-[0_6px_24px_rgb(0_0_0/35%)]"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="cursor-pointer rounded-full px-2.5 py-1 hover:bg-white/20"
      aria-label="Previous variant"
      @click="go(-1)"
    >
      ←
    </button>
    <span class="min-w-[180px] text-center font-semibold">{{ label }}</span>
    <button
      type="button"
      class="cursor-pointer rounded-full px-2.5 py-1 hover:bg-white/20"
      aria-label="Next variant"
      @click="go(1)"
    >
      →
    </button>
    <slot />
  </div>
</template>
