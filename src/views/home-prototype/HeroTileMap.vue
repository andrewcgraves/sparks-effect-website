<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The hero splash zone on real tiles. The SVG
// drawing paints first; MapLibre is imported only once the page is idle, then
// fades in over it, inert until clicked. That keeps MapLibre off the LCP path.
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { HeroSplash } from './homePrototypeData'
import { resolveMapStyleUrl } from '../../mapStyle'
import { isochroneBoundsCorners } from '../../fixtures/isochrone'
import SplashSvg from './SplashSvg.vue'

const props = defineProps<{ hero: HeroSplash }>()

const container = ref<HTMLElement | null>(null)
const map = shallowRef<MapLibreMap | null>(null)
const ready = ref(false)
const live = ref(false)

function idle(cb: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback
  if (ric) ric(cb)
  else setTimeout(cb, 300)
}

onMounted(() => {
  idle(async () => {
    const [{ Map }] = await Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl.css')])
    if (!container.value) return
    const m = new Map({
      container: container.value,
      style: resolveMapStyleUrl(),
      bounds: isochroneBoundsCorners(props.hero.chain.features, 0.06),
      attributionControl: { compact: true },
    })
    for (const h of [m.scrollZoom, m.dragPan, m.dragRotate, m.doubleClickZoom, m.touchZoomRotate, m.keyboard, m.boxZoom]) h.disable()
    m.on('load', () => {
      m.addSource('line', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: props.hero.paths.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })) },
      })
      m.addSource('splash', { type: 'geojson', data: props.hero.chain })
      m.addLayer({ id: 'line', type: 'line', source: 'line', paint: { 'line-color': '#b8b8be', 'line-width': 3 } })
      m.addLayer({
        id: 'splash',
        type: 'fill',
        source: 'splash',
        paint: {
          'fill-color': ['match', ['get', 'source'], 'origin', '#1034b1', '#f28f29'],
          'fill-opacity': 0.35,
        },
      })
      m.addLayer({
        id: 'splash-edge',
        type: 'line',
        source: 'splash',
        paint: { 'line-color': ['match', ['get', 'source'], 'origin', '#1034b1', '#f28f29'], 'line-width': 1 },
      })
      ready.value = true
    })
    map.value = m
  })
})

function wake(): void {
  const m = map.value
  if (!m || live.value) return
  for (const h of [m.scrollZoom, m.dragPan, m.doubleClickZoom, m.touchZoomRotate, m.keyboard]) h.enable()
  live.value = true
}

onBeforeUnmount(() => map.value?.remove())
</script>

<template>
  <div
    class="relative h-full w-full overflow-hidden bg-surface"
    @click="wake"
  >
    <div
      class="absolute inset-0 flex items-center justify-center transition-opacity duration-700 md:pl-[520px]"
      :class="ready ? 'opacity-0' : 'opacity-100'"
    >
      <SplashSvg
        :hero="hero"
        :width="900"
        :height="560"
        class="max-h-full"
      />
    </div>
    <div
      ref="container"
      class="absolute inset-0 transition-opacity duration-700"
      :class="ready ? 'opacity-100' : 'opacity-0'"
    />
    <p
      v-if="ready && !live"
      class="font-display text-micro pointer-events-none absolute right-4 bottom-4 rounded-(--radius-field) bg-white/90 px-2 py-1 text-ink-muted uppercase shadow-(--shadow-panel)"
    >
      Click to explore the map
    </p>
  </div>
</template>
