<script setup lang="ts">
// PROTOTYPE (throwaway): floating variant switcher for ?variant= prototypes.
// Dev builds only; never ships.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ variants: { key: string; name: string }[] }>()
const route = useRoute()
const router = useRouter()
const show = import.meta.env.DEV

const index = computed(() => {
  const i = props.variants.findIndex((v) => v.key === route.query.variant)
  return i < 0 ? 0 : i
})
const current = computed(() => props.variants[index.value])

function go(step: number) {
  const n = props.variants.length
  const next = props.variants[(index.value + step + n) % n]
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(event: KeyboardEvent) {
  const t = event.target as HTMLElement | null
  if (t?.closest('input, textarea, select, [contenteditable]')) return
  if (event.key === 'ArrowLeft') go(-1)
  else if (event.key === 'ArrowRight') go(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport
    v-if="show"
    to="body"
  >
    <div
      class="fixed top-3 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black px-2 py-1.5 font-mono text-[13px] text-white shadow-2xl ring-2 ring-yellow-300 md:top-auto md:bottom-5"
    >
      <button
        type="button"
        class="cursor-pointer rounded-full px-2 hover:bg-white/20"
        aria-label="Previous variant"
        @click="go(-1)"
      >
        ←
      </button>
      <span class="px-2 whitespace-nowrap">
        <span class="text-yellow-300">{{ current.key }}</span> ({{ current.name }})
      </span>
      <button
        type="button"
        class="cursor-pointer rounded-full px-2 hover:bg-white/20"
        aria-label="Next variant"
        @click="go(1)"
      >
        →
      </button>
    </div>
  </Teleport>
</template>
