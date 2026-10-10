<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The one hero treatment the quiet variants
// (D–G) share: the prerendered splash zone as a tile-free drawing inside the
// same grey panel the line cards use, with a single line of caption under it.
import { computed } from 'vue'
import type { HeroSplash } from '../homePrototypeData'
import SplashSvg from '../SplashSvg.vue'

const props = withDefaults(defineProps<{ hero: HeroSplash; aspect?: 'wide' | 'tall' }>(), { aspect: 'tall' })

// A wide frame squeezed to a phone is unreadable, so below the tablet width
// the wide figure falls back to the tall framing.
const TALL = { width: 640, height: 560 }
const WIDE = { width: 1120, height: 520 }
const wide = computed(() => props.aspect === 'wide')
const reachedCount = computed(() => props.hero.chain.metadata.reachable_stations.length)
</script>

<template>
  <figure class="overflow-hidden rounded-(--radius-box) bg-surface">
    <SplashSvg
      :hero="hero"
      :width="TALL.width"
      :height="TALL.height"
      :class="wide && 'md:hidden'"
    />
    <SplashSvg
      v-if="wide"
      :hero="hero"
      :width="WIDE.width"
      :height="WIDE.height"
      class="hidden md:block"
    />
    <figcaption class="font-body text-caption flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 text-ink-muted">
      <span class="text-ink">{{ hero.label }}</span>
      <span>
        <span class="mr-1 inline-block size-2.5 rounded-full bg-data-origin/60 align-[-1px]" />Walk to a station
        <span class="mr-1 ml-4 inline-block size-2.5 rounded-full bg-data-egress/60 align-[-1px]" />Reached by train, {{ reachedCount }} stations
      </span>
    </figcaption>
  </figure>
</template>
