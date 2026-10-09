<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. A prerendered splash zone drawn as plain
// SVG over no basemap: the line, its stations, the walk zone around the start
// and the zones around each station reached. `stage` builds it up in steps for
// the step-through variant; 3 is the whole picture.
import { computed } from 'vue'
import type { Polygon, MultiPolygon } from 'geojson'
import type { HeroSplash, LngLat } from './homePrototypeData'
import { projector } from './svgProjection'

const props = withDefaults(defineProps<{ hero: HeroSplash; stage?: 1 | 2 | 3; width?: number; height?: number }>(), {
  stage: 3,
  width: 640,
  height: 520,
})

function rings(geometry: Polygon | MultiPolygon): LngLat[][] {
  return geometry.type === 'Polygon'
    ? (geometry.coordinates as LngLat[][])
    : (geometry.coordinates as LngLat[][][]).flat()
}

const view = computed(() => {
  // Framed on the zones, not the whole line: a line to Los Angeles would
  // shrink a San Jose splash zone to a dot.
  const pts = [props.hero.origin, ...props.hero.chain.features.flatMap((f) => rings(f.geometry).flat())]
  return projector(pts, props.width, props.height, 48)
})

const originZones = computed(() => props.hero.chain.features.filter((f) => f.properties.source === 'origin'))
const egressZones = computed(() => props.hero.chain.features.filter((f) => f.properties.source === 'egress'))

const reached = computed(() => {
  const bySlug = new Map(props.hero.chain.metadata.reachable_stations.map((s) => [s.station_slug, s]))
  return egressZones.value.map((f) => {
    const slug = f.properties.station_slug ?? ''
    const station = props.hero.stations.find((s) => s.slug === slug)
    const [minX, minY] = rings(f.geometry).flat().reduce(([x, y], p) => {
      const [px, py] = view.value.project(p)
      return [Math.max(x, px), Math.min(y, py)]
    }, [-Infinity, Infinity])
    return { slug, name: station?.name ?? slug, x: minX + 6, y: minY + 10, remaining: bySlug.get(slug)?.remaining_mins }
  })
})

function d(geometry: Polygon | MultiPolygon): string {
  return rings(geometry).map((r) => view.value.path(r, true)).join('')
}
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    class="block h-auto w-full overflow-hidden"
    role="img"
    :aria-label="`Splash zone: ${hero.label}`"
  >
    <path
      v-for="(p, i) in hero.paths"
      :key="`line-${i}`"
      :d="view.path(p)"
      class="fill-none stroke-ink-faint"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <g
      class="transition-opacity duration-500"
      :opacity="stage >= 2 ? 1 : 0"
    >
      <path
        v-for="(f, i) in originZones"
        :key="`o-${i}`"
        :d="d(f.geometry)"
        class="fill-data-origin stroke-data-origin"
        fill-opacity="0.35"
        stroke-width="1"
        fill-rule="evenodd"
      />
    </g>
    <g
      class="transition-opacity duration-500"
      :opacity="stage >= 3 ? 1 : 0"
    >
      <path
        v-for="(f, i) in egressZones"
        :key="`e-${i}`"
        :d="d(f.geometry)"
        class="fill-data-egress stroke-data-egress"
        fill-opacity="0.35"
        stroke-width="1"
        fill-rule="evenodd"
      />
      <text
        v-for="r in reached"
        :key="`t-${r.slug}`"
        :x="r.x"
        :y="r.y"
        class="fill-ink font-display"
        font-size="13"
        font-weight="700"
      >{{ r.name }}<tspan
        v-if="r.remaining !== undefined"
        class="fill-ink-muted font-body"
        font-weight="400"
        :x="r.x"
        dy="15"
      >{{ r.remaining }} min to spare</tspan></text>
    </g>
    <circle
      v-for="s in hero.stations"
      :key="s.name"
      :cx="view.project(s.at)[0]"
      :cy="view.project(s.at)[1]"
      r="4"
      class="fill-white stroke-ink"
      stroke-width="2"
    />
    <g :transform="`translate(${view.project(hero.origin).join(',')})`">
      <circle
        r="9"
        class="fill-coral/25"
      />
      <circle
        r="5"
        class="fill-coral stroke-white"
        stroke-width="2"
      />
    </g>
  </svg>
</template>
