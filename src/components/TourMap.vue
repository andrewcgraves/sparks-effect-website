<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Marker, type Map, type PointLike } from 'maplibre-gl'
import { createSiteMap, splashZoneModules } from '../composables/siteMap'
import { mapModules } from '../composables/mapLifecycle'
import { resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { centerFromCorners } from '../composables/useRouteLayer'
import { TOUR_SAMPLE } from '../fixtures/tourSample'
import { progressTooltipContent, stationTooltipContent, tooltipContent } from './tooltip'
import { calloutFor, cameraBounds, tourPaint, type CalloutAnchor, type TourCallout } from './tourHighlight'
import type { TourStep } from './tourSteps'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

const props = defineProps<{ step: TourStep | null }>()

const TRANSITION_MS = 300
const CAMERA_MS = 900
const CALLOUT_GAP_PX = 12

const sample = TOUR_SAMPLE
const { modules } = splashZoneModules(
  {
    plot: () => sample.plot,
    routes: () => sample.routes,
    stations: () => sample.stations,
    origin: () => sample.start,
  },
  resolveIsochroneColors(),
)
const lifecycle = mapModules(modules)

const frame = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const loaded = ref(false)
const markerLit = ref(true)

let map: Map | null = null
let callout: Marker | null = null
let intersection: IntersectionObserver | null = null
let resize: ResizeObserver | null = null

const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches
const reducedMotion = () => matches('(prefers-reduced-motion: reduce)')

function calloutElement(c: TourCallout): HTMLElement {
  const content = c.kind === 'station'
    ? stationTooltipContent(c.name, c.remainingSecs)
    : c.kind === 'progress'
      ? progressTooltipContent(c.fraction, c.stationName, c.rideSecs)
      : tooltipContent(c.text)
  const element = document.createElement('div')
  element.className = 'tour-callout pointer-events-none w-max max-w-60'
  element.setAttribute('aria-hidden', 'true')
  element.append(content)
  return element
}

const CALLOUT_OFFSET: Record<CalloutAnchor, PointLike> = {
  top: [0, CALLOUT_GAP_PX],
  bottom: [0, -CALLOUT_GAP_PX],
  left: [CALLOUT_GAP_PX, 0],
  right: [-CALLOUT_GAP_PX, 0],
}

function placeCallout(step: TourStep | null): void {
  callout?.remove()
  callout = null
  if (!map || !step) return
  const c = calloutFor(step.id, sample)
  // MapLibre cannot re-anchor a marker, so each step gets a new one.
  callout = new Marker({ element: calloutElement(c), anchor: c.anchor, offset: CALLOUT_OFFSET[c.anchor] })
    .setLngLat(c.lngLat)
    .addTo(map)
}

function moveCamera(step: TourStep | null, instant: boolean): void {
  if (!map) return
  const { corners, maxZoom } = cameraBounds(step?.camera ?? 'regional', sample)
  const inset = matches('(min-width: 64rem)') ? 48 : 24
  if (instant || reducedMotion()) {
    const camera = map.cameraForBounds(corners, { padding: inset, maxZoom })
    if (camera) map.jumpTo(camera)
    return
  }
  // An ease, never a flight: the zoom changes by a level or two between steps,
  // and an arc out and back in would lose the reader's place.
  map.fitBounds(corners, { padding: inset, maxZoom, duration: CAMERA_MS })
}

function apply(step: TourStep | null, instant = false): void {
  markerLit.value = step === null || step.lit.includes('origin-marker')
  if (!map || !loaded.value) return
  for (const { layer, property, value } of tourPaint(step?.lit ?? null)) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value)
  }
  moveCamera(step, instant)
  placeCallout(step)
}

function easePaint(): void {
  if (!map) return
  const duration = reducedMotion() ? 0 : TRANSITION_MS
  for (const { layer, property } of tourPaint(null)) {
    const transition = `${property}-transition` as const
    if (map.getLayer(layer)) map.setPaintProperty(layer, transition, { duration, delay: 0 })
  }
}

function init(): void {
  if (!container.value || map) return
  const { corners } = cameraBounds('regional', sample)
  try {
    map = createSiteMap(
      { container: container.value, interactive: false, center: centerFromCorners(corners), zoom: 8, fadeDuration: 0 },
      { compact: true },
    )
  } catch {
    // No WebGL: the skeleton stays, and every caption still reads without it.
    map = null
    return
  }
  map.getCanvas().setAttribute('aria-hidden', 'true')
  lifecycle.sync(map, false)
  map.on('load', () => {
    if (!map) return
    // Compact credits open expanded and only fold once the map is touched,
    // which this one never is; folded, they sit behind ⓘ in the corner
    // instead of across the plot.
    map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    lifecycle.sync(map, true)
    loaded.value = true
    easePaint()
    apply(props.step, true)
  })
  resize = new ResizeObserver(() => {
    if (!map || !loaded.value) return
    map.resize()
    moveCamera(props.step, true)
  })
  resize.observe(container.value)
}

watch(() => props.step, (step) => apply(step))

onMounted(() => {
  if (!frame.value || typeof IntersectionObserver === 'undefined') return
  // The map is built only once its frame comes near the screen: the page above
  // it is prose, and a reader who never scrolls down never pays for the tiles.
  intersection = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      intersection?.disconnect()
      intersection = null
      init()
    },
    { rootMargin: '200px' },
  )
  intersection.observe(frame.value)
})

onUnmounted(() => {
  intersection?.disconnect()
  resize?.disconnect()
  callout?.remove()
  lifecycle.detach()
  map?.remove()
  map = null
})
</script>

<template>
  <figure
    ref="frame"
    class="tour-frame relative m-0 h-full w-full overflow-hidden bg-surface lg:rounded-(--radius-box) lg:border lg:border-border"
    :data-marker-lit="markerLit"
    data-testid="tour-map"
  >
    <figcaption class="sr-only">
      A splash zone: {{ sample.budget_mins }} minutes by Transit from {{ sample.start.label }}, on the
      California High-Speed Rail network. Each step beside it says what is highlighted.
    </figcaption>
    <div
      ref="container"
      class="h-full w-full"
    />
    <LoadingRegion
      v-if="!loaded"
      label="Loading map"
      class="pointer-events-none absolute inset-0 z-1"
    >
      <SkeletonShape
        shape="block"
        class="size-full"
      />
    </LoadingRegion>
  </figure>
</template>

<style scoped>
/* MapLibre's canvas gets its own compositor layer, which `overflow: hidden`
   does not reliably clip to a rounded corner; see MapView. */
@media (min-width: 64rem) {
  .tour-frame {
    clip-path: inset(0 round var(--radius-box));
  }
}

/* The map is a picture here, not a control: swipes and wheels scroll the page. */
.tour-frame :deep(.maplibregl-canvas-container),
.tour-frame :deep(.maplibregl-canvas) {
  touch-action: auto;
  cursor: default;
}

/* The origin marker is a DOM element MapLibre owns, so it is dimmed here
   rather than by paint. The callouts are markers too, and are never dimmed. */
.tour-frame :deep(.maplibregl-marker:not(.tour-callout)) {
  transition: opacity 300ms var(--ease-smooth);
}

.tour-frame[data-marker-lit='false'] :deep(.maplibregl-marker:not(.tour-callout)) {
  opacity: 0.25;
}

.tour-frame :deep(.tour-callout) {
  animation: tour-callout-in 300ms var(--ease-smooth);
}

@keyframes tour-callout-in {
  from {
    opacity: 0;
  }
}

.tour-frame :deep(.maplibregl-ctrl-attrib) {
  font-family: var(--font-body);
  font-size: var(--text-micro);
}

.tour-frame :deep(.maplibregl-ctrl-attrib a) {
  color: var(--color-ink-muted);
}
</style>
