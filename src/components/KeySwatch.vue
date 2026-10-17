<script setup lang="ts">
import { keySwatchPaint, type KeySwatchKind } from './keySwatchPaint'

defineProps<{ kind: KeySwatchKind }>()

const paint = keySwatchPaint()
</script>

<!-- Each swatch is drawn with the ends the map draws it with: the first leg
     runs from the coral pin to a reached station's ringed dot, and an
     unfinished ride stops on a bare ink dot. Two thin dashed lines in navy and
     near-black were otherwise indistinguishable at swatch size. -->
<template>
  <span
    v-if="kind === 'origin' || kind === 'egress'"
    class="inline-block h-3.5 w-7 rounded-(--radius-field) opacity-85"
    :style="{ backgroundColor: kind === 'origin' ? paint.origin : paint.egress }"
    aria-hidden="true"
  />
  <svg
    v-else
    width="28"
    height="14"
    viewBox="0 0 28 14"
    aria-hidden="true"
  >
    <g
      v-if="kind === 'start'"
      transform="translate(14 13.5) scale(0.62)"
    >
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
    <template v-else-if="kind === 'starter'">
      <line
        x1="7"
        y1="7"
        x2="19"
        y2="7"
        :stroke="paint.origin"
        :stroke-width="paint.walkWidth"
        stroke-linecap="round"
        :stroke-dasharray="paint.walkDash"
      />
      <circle
        cx="3.5"
        cy="7"
        r="2.5"
        :fill="paint.pin"
      />
      <circle
        cx="23.5"
        cy="7"
        r="3.25"
        :fill="paint.egress"
        :stroke="paint.ink"
        stroke-width="1.5"
      />
    </template>
    <template v-else-if="kind === 'unfinished'">
      <line
        x1="2"
        y1="7"
        x2="19"
        y2="7"
        :stroke="paint.ink"
        :stroke-width="paint.lineWidth"
        stroke-linecap="round"
        :stroke-dasharray="paint.progressDash"
      />
      <circle
        cx="23.5"
        cy="7"
        :r="paint.capRadius"
        :fill="paint.ink"
      />
    </template>
    <template v-else-if="kind === 'ridden'">
      <line
        x1="4"
        y1="7"
        x2="24"
        y2="7"
        :stroke="paint.ink"
        :stroke-width="paint.lineWidth"
      />
      <circle
        cx="4"
        cy="7"
        r="3.25"
        :fill="paint.egress"
        :stroke="paint.ink"
        stroke-width="1.5"
      />
      <circle
        cx="24"
        cy="7"
        r="3.25"
        :fill="paint.egress"
        :stroke="paint.ink"
        stroke-width="1.5"
      />
    </template>
    <line
      v-else
      x1="2"
      y1="7"
      x2="26"
      y2="7"
      :stroke="paint.unridden"
      :stroke-width="paint.lineWidth"
      stroke-linecap="round"
    />
  </svg>
</template>
