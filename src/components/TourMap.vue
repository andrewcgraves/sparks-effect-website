<script setup lang="ts">
import { effectScope, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Map, Marker, PointLike } from 'maplibre-gl'
import { mapModules } from '../composables/mapLifecycle'
import { resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { centerFromCorners } from '../composables/useRouteLayer'
import { REDUCED_MOTION_QUERY, TOUR_WIDE_QUERY, matchesMedia } from '../composables/media'
import { TOUR_SAMPLE } from '../fixtures/tourSample'
import { progressTooltipContent, stationTooltipContent, tooltipContent } from './tooltip'
import {
  calloutFor,
  cameraBounds,
  fitAnchor,
  tourPaint,
  type CalloutAnchor,
  type TourCallout,
} from './tourHighlight'
import type { TourStep } from './tourSteps'
import LoadingRegion from './LoadingRegion.vue'
import SkeletonShape from './SkeletonShape.vue'

const props = defineProps<{ step: TourStep | null }>()

const TRANSITION_MS = 300
const CAMERA_MS = 900
const CALLOUT_GAP_PX = 12

const sample = TOUR_SAMPLE

const frame = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const loaded = ref(false)
const failed = ref(false)
const markerLit = ref(true)

let map: Map | null = null
let MarkerClass: typeof Marker | null = null
let callout: Marker | null = null
let lifecycle: ReturnType<typeof mapModules> | null = null
let intersection: IntersectionObserver | null = null
let resize: ResizeObserver | null = null
let placing = 0
const scope = effectScope()

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

const half = CALLOUT_GAP_PX / 2
const CALLOUT_OFFSET: Record<CalloutAnchor, PointLike> = {
  top: [0, CALLOUT_GAP_PX],
  bottom: [0, -CALLOUT_GAP_PX],
  left: [CALLOUT_GAP_PX, 0],
  right: [-CALLOUT_GAP_PX, 0],
  'top-left': [half, CALLOUT_GAP_PX],
  'top-right': [-half, CALLOUT_GAP_PX],
  'bottom-left': [half, -CALLOUT_GAP_PX],
  'bottom-right': [-half, -CALLOUT_GAP_PX],
}

function clearCallout(): void {
  callout?.remove()
  callout = null
}

function placeCallout(step: TourStep): void {
  if (!map || !MarkerClass || !container.value) return
  const c = calloutFor(step.id, sample)
  const element = calloutElement(c)
  // Measured off-screen first: which side the label goes depends on its size
  // and on where its point has landed once the camera has settled.
  element.style.visibility = 'hidden'
  container.value.append(element)
  const label = { width: element.offsetWidth, height: element.offsetHeight }
  element.remove()
  element.style.visibility = ''
  const size = { width: container.value.clientWidth, height: container.value.clientHeight }
  const anchor = fitAnchor(c.anchor, map.project(c.lngLat), size, label, CALLOUT_GAP_PX)
  // MapLibre cannot re-anchor a marker, so each step gets a new one.
  callout = new MarkerClass({ element, anchor, offset: CALLOUT_OFFSET[anchor] }).setLngLat(c.lngLat).addTo(map)
}

function moveCamera(step: TourStep | null, instant: boolean): void {
  if (!map) return
  const { corners, maxZoom } = cameraBounds(step?.camera ?? 'regional', sample)
  const padding = matchesMedia(TOUR_WIDE_QUERY) ? 48 : 24
  const token = ++placing
  const settle = () => {
    if (token === placing && step) placeCallout(step)
  }
  if (instant || matchesMedia(REDUCED_MOTION_QUERY)) {
    const camera = map.cameraForBounds(corners, { padding, maxZoom })
    if (camera) map.jumpTo(camera)
    settle()
    return
  }
  // An ease, never a flight: the zoom changes by a level or two between steps,
  // and an arc out and back in would lose the reader's place.
  map.once('moveend', settle)
  map.fitBounds(corners, { padding, maxZoom, duration: CAMERA_MS })
}

function apply(step: TourStep | null, instant = false): void {
  markerLit.value = step === null || step.lit.includes('origin-marker')
  if (!map || !loaded.value) return
  for (const { layer, property, value } of tourPaint(step?.lit ?? null, step?.camera)) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value)
  }
  clearCallout()
  moveCamera(step, instant)
}

function easePaint(): void {
  if (!map) return
  const duration = matchesMedia(REDUCED_MOTION_QUERY) ? 0 : TRANSITION_MS
  for (const { layer, property } of tourPaint(null)) {
    const transition = `${property}-transition` as const
    if (map.getLayer(layer)) map.setPaintProperty(layer, transition, { duration, delay: 0 })
  }
}

async function init(): Promise<void> {
  if (!container.value || map) return
  // Loaded only once the tour comes near the screen: MapLibre is most of the
  // page's weight, and the prose above it should not wait on it.
  const { Marker: LoadedMarker, createSiteMap, splashZoneModules } = await import('../composables/siteMap')
  if (!container.value) return
  MarkerClass = LoadedMarker
  const { corners } = cameraBounds('regional', sample)
  try {
    map = createSiteMap(
      { container: container.value, interactive: false, center: centerFromCorners(corners), zoom: 8, fadeDuration: 0 },
      { compact: true },
    )
  } catch {
    // No WebGL: there is no map coming, so no placeholder either; every
    // caption still reads without it.
    map = null
    failed.value = true
    return
  }
  const { modules } = splashZoneModules(
    {
      plot: () => sample.plot,
      routes: () => sample.routes,
      stations: () => sample.stations,
      origin: () => sample.start,
    },
    resolveIsochroneColors(),
  )
  // Built after an await, so outside the component's own scope: this one is
  // stopped with the component, and takes the modules' watchers with it.
  lifecycle = scope.run(() => mapModules(modules)) ?? null
  map.getCanvas().setAttribute('aria-hidden', 'true')
  lifecycle?.sync(map, false)
  map.on('load', () => {
    if (!map) return
    // Compact credits open expanded and only fold once the map is touched,
    // which this one never is; folded, they sit behind ⓘ in the corner
    // instead of across the plot.
    map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    lifecycle?.sync(map, true)
    loaded.value = true
    easePaint()
    apply(props.step, true)
  })
  resize = new ResizeObserver(() => {
    if (!map || !loaded.value) return
    map.resize()
    clearCallout()
    moveCamera(props.step, true)
  })
  resize.observe(container.value)
}

watch(() => props.step, (step) => apply(step))

onMounted(() => {
  if (!frame.value || typeof IntersectionObserver === 'undefined') return
  intersection = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      intersection?.disconnect()
      intersection = null
      void init()
    },
    { rootMargin: '200px' },
  )
  intersection.observe(frame.value)
})

onUnmounted(() => {
  intersection?.disconnect()
  resize?.disconnect()
  clearCallout()
  lifecycle?.detach()
  scope.stop()
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
      v-if="!loaded && !failed"
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
