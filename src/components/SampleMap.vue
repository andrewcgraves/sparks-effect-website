<script setup lang="ts">
import { useId } from 'vue'
import { SAMPLE_GEOMETRY as G, sampleMapPaint, type SampleMapPart } from './sampleMapData'

const props = defineProps<{
  focus: readonly SampleMapPart[] | null
}>()

const emit = defineEmits<{
  'select-part': [part: SampleMapPart]
}>()

const paint = sampleMapPaint()
const id = useId()
const titleId = `${id}-title`
const descId = `${id}-desc`

// A thin stroke is too fine a target for a finger or a trackpad, so each line
// carries an unpainted twin wide enough to hit.
const HIT_WIDTH = 12

function lit(part: SampleMapPart): boolean {
  return props.focus === null || props.focus.includes(part)
}

function partAttrs(part: SampleMapPart) {
  return {
    'data-part': part,
    'data-lit': String(lit(part)),
    'class': [
      'cursor-pointer transition-opacity duration-300 ease-(--ease-smooth)',
      lit(part) ? 'opacity-100' : 'opacity-15',
    ],
    'onClick': () => emit('select-part', part),
  }
}
</script>

<template>
  <svg
    class="block h-auto w-full"
    :viewBox="G.viewBox"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-labelledby="`${titleId} ${descId}`"
    data-testid="sample-map"
  >
    <title :id="titleId">A sample splash zone</title>
    <desc :id="descId">
      A starting point with a first leg to the nearest station. A blue area, Origin reach, surrounds
      the start. The line runs across the map: Ridden in black between three orange stations,
      Unfinished in black dashes ending in a dot on either side, and Unridden in grey beyond. An
      orange area, From station, surrounds each station the trip reaches.
    </desc>

    <g
      fill="none"
      stroke="#ffffff"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        v-for="road in G.roads"
        :key="road.d"
        :d="road.d"
        :stroke-width="road.width"
      />
    </g>

    <g v-bind="partAttrs('origin-fill')">
      <path
        :d="G.originFill"
        :fill="paint.origin"
        :fill-opacity="paint.fillOpacity"
      />
    </g>

    <g v-bind="partAttrs('egress-fill')">
      <path
        v-for="d in G.egressFills"
        :key="d"
        :d="d"
        :fill="paint.egress"
        :fill-opacity="paint.fillOpacity"
      />
    </g>

    <g
      v-bind="partAttrs('route-line')"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        :d="G.route"
        stroke="transparent"
        :stroke-width="HIT_WIDTH"
        pointer-events="stroke"
      />
      <path
        :d="G.route"
        :stroke="paint.unridden"
        :stroke-width="paint.lineWidth"
      />
    </g>

    <g
      v-bind="partAttrs('ridden-line')"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        :d="G.ridden"
        stroke="transparent"
        :stroke-width="HIT_WIDTH"
        pointer-events="stroke"
      />
      <path
        :d="G.ridden"
        :stroke="paint.ink"
        :stroke-width="paint.lineWidth"
      />
    </g>

    <g
      v-bind="partAttrs('progress-line')"
      fill="none"
      stroke-linecap="round"
    >
      <template
        v-for="stub in G.progress"
        :key="stub.d"
      >
        <path
          :d="stub.d"
          stroke="transparent"
          :stroke-width="HIT_WIDTH"
          pointer-events="stroke"
        />
        <path
          :d="stub.d"
          :stroke="paint.ink"
          :stroke-width="paint.lineWidth"
          :stroke-dasharray="paint.progressDash"
        />
      </template>
    </g>

    <g v-bind="partAttrs('progress-cap')">
      <template
        v-for="stub in G.progress"
        :key="stub.d"
      >
        <circle
          :cx="stub.cap[0]"
          :cy="stub.cap[1]"
          :r="HIT_WIDTH / 2"
          fill="transparent"
        />
        <circle
          :cx="stub.cap[0]"
          :cy="stub.cap[1]"
          :r="paint.capRadius"
          :fill="paint.ink"
        />
      </template>
    </g>

    <g
      v-bind="partAttrs('station-dots')"
    >
      <circle
        v-for="station in G.stations"
        :key="`${station.x},${station.y}`"
        :cx="station.x"
        :cy="station.y"
        :r="paint.stationRadius"
        :fill="station.reached ? paint.reachedStation : paint.unreachedStation"
        :stroke="paint.ink"
        :stroke-width="paint.stationStrokeWidth"
      />
    </g>

    <g
      v-bind="partAttrs('origin-walk')"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        :d="G.walk"
        stroke="transparent"
        :stroke-width="HIT_WIDTH"
        pointer-events="stroke"
      />
      <path
        :d="G.walk"
        :stroke="paint.origin"
        :stroke-width="paint.walkWidth"
        :stroke-dasharray="paint.walkDash"
      />
    </g>

    <g
      v-bind="partAttrs('origin-marker')"
      :transform="`translate(${G.start[0]} ${G.start[1]}) scale(1.25)`"
    >
      <ellipse
        cx="0"
        cy="0"
        rx="5"
        ry="1.8"
        fill="#000000"
        fill-opacity="0.2"
      />
      <path
        d="M0 0 C-1.6 -4.4 -7 -8.2 -7 -13 A7 7 0 1 1 7 -13 C7 -8.2 1.6 -4.4 0 0 Z"
        :fill="paint.pin"
      />
      <circle
        cx="0"
        cy="-13"
        r="2.6"
        fill="#ffffff"
      />
    </g>
  </svg>
</template>
