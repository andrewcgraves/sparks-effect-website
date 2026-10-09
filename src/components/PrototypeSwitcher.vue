<script setup lang="ts">
// PROTOTYPE — throwaway. Floating variant switcher for ?variant= UI
// prototypes. Dev builds only, so a stray merge can't ship it.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  variants: { key: string; label: string }[]
  current: string
}>()

const enabled = import.meta.env.DEV
const router = useRouter()
const route = useRoute()

const index = computed(() => Math.max(0, props.variants.findIndex((v) => v.key === props.current)))
const label = computed(() => {
  const v = props.variants[index.value]
  return v ? `${v.key} — ${v.label}` : props.current
})

function go(step: number) {
  const n = props.variants.length
  const next = props.variants[(index.value + step + n) % n]
  if (!next) return
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  if (event.key === 'ArrowLeft') go(-1)
  if (event.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Mid-right rather than bottom-centre: on these pages the bottom of the
       screen is the design under review. -->
  <div
    v-if="enabled"
    class="fixed top-[38%] right-2 z-[100] flex items-center gap-1 rounded-full bg-slate px-1 py-1 text-white shadow-lg ring-2 ring-apricot"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="grid size-7 place-items-center rounded-full hover:bg-white/15"
      aria-label="Previous variant"
      @click="go(-1)"
    >
      ‹
    </button>
    <span class="font-display max-w-[9.5rem] truncate text-[11px] font-bold tracking-wide">{{ label }}</span>
    <button
      type="button"
      class="grid size-7 place-items-center rounded-full hover:bg-white/15"
      aria-label="Next variant"
      @click="go(1)"
    >
      ›
    </button>
  </div>
</template>
