<script setup lang="ts">
// PROTOTYPE switcher: flips ?variant= on the current route. Dev builds only.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{
  variants: { key: string; name: string }[]
  current: string
  toggles?: { key: string; label: string }[]
}>()

const route = useRoute()
const router = useRouter()
const show = import.meta.env.DEV

const index = computed(() => Math.max(0, props.variants.findIndex((v) => v.key === props.current)))
const currentName = computed(() => props.variants[index.value]?.name ?? '')

function go(step: number) {
  const n = props.variants.length
  const next = props.variants[(index.value + step + n) % n]
  void router.replace({ query: { ...route.query, variant: next.key } })
}

function flip(key: string) {
  const query = { ...route.query }
  if (query[key] === '1') delete query[key]
  else query[key] = '1'
  void router.replace({ query })
}

function onKeydown(event: KeyboardEvent) {
  const el = event.target as HTMLElement | null
  if (el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
  if (event.key === 'ArrowLeft') go(-1)
  if (event.key === 'ArrowRight') go(1)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    v-if="show"
    class="fixed bottom-4 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/90 px-2 py-1.5 font-mono text-[12px] text-white shadow-lg ring-2 ring-fuchsia-400"
    data-testid="prototype-switcher"
  >
    <button
      type="button"
      class="cursor-pointer rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Previous variant"
      @click="go(-1)"
    >
      ←
    </button>
    <span class="min-w-40 text-center whitespace-nowrap">
      {{ current }} ({{ currentName }})
    </span>
    <button
      type="button"
      class="cursor-pointer rounded-full px-2 py-1 hover:bg-white/20"
      aria-label="Next variant"
      @click="go(1)"
    >
      →
    </button>
    <button
      v-for="t in toggles ?? []"
      :key="t.key"
      type="button"
      class="ml-1 cursor-pointer rounded-full px-2 py-1 whitespace-nowrap"
      :class="route.query[t.key] === '1' ? 'bg-fuchsia-400 text-black' : 'bg-white/10 hover:bg-white/20'"
      @click="flip(t.key)"
    >
      {{ t.label }}
    </button>
  </div>
</template>
