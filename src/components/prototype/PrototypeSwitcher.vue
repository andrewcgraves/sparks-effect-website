<script setup lang="ts">
// PROTOTYPE (SPA-462): floating bar that cycles a `?variant=` query param.
// Dev only; never meant to ship.
import { computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ variants: { key: string; name: string }[] }>()

const route = useRoute()
const router = useRouter()

const current = computed(() => {
  const key = typeof route.query.variant === 'string' ? route.query.variant : props.variants[0].key
  const index = props.variants.findIndex((v) => v.key === key)
  return index === -1 ? 0 : index
})

const hidden = computed(() => route.query.switcher === '0' || !import.meta.env.DEV)

function go(step: number): void {
  const next = (current.value + step + props.variants.length) % props.variants.length
  void router.replace({ query: { ...route.query, variant: props.variants[next].key } })
}

function onKey(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null
  if (target && (target.closest('input, textarea, select, [contenteditable]'))) return
  if (e.key === 'ArrowLeft') go(-1)
  if (e.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    v-if="!hidden"
    class="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink-true px-2 py-1 font-mono text-[12px] text-white shadow-(--shadow-panel)"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="size-7 cursor-pointer rounded-full hover:bg-white/15"
      aria-label="Previous variant"
      @click="go(-1)"
    >
      ←
    </button>
    <span class="whitespace-nowrap">
      {{ variants[current].key }} · {{ variants[current].name }}
    </span>
    <button
      type="button"
      class="size-7 cursor-pointer rounded-full hover:bg-white/15"
      aria-label="Next variant"
      @click="go(1)"
    >
      →
    </button>
  </div>
</template>
