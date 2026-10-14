<script setup lang="ts">
import { computed, ref } from 'vue'
import SampleMap from './SampleMap.vue'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { TOUR_STEPS, stepForPart } from './tourSteps'
import { sampleMapPaint, type SampleMapPart } from './sampleMapData'

const paint = sampleMapPaint()
const activeIndex = ref<number | null>(null)
const announcement = ref('')
const itemRefs = ref<HTMLLIElement[]>([])

const total = TOUR_STEPS.length
const focus = computed(() => activeIndex.value === null ? null : TOUR_STEPS[activeIndex.value].focus)
const counter = computed(() => activeIndex.value === null ? 'Overview' : `${activeIndex.value + 1} of ${total}`)
const atFirst = computed(() => activeIndex.value === null || activeIndex.value === 0)
const atLast = computed(() => activeIndex.value === total - 1)

const STEP_BUTTON_CLASS = `${SECONDARY_BUTTON_CLASS} aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent`

function show(index: number | null): void {
  activeIndex.value = index
  if (index === null) {
    announcement.value = 'Overview. The whole map.'
    return
  }
  const step = TOUR_STEPS[index]
  announcement.value = `Step ${index + 1} of ${total}. ${step.name}. ${step.caption}`
}

function reveal(index: number): void {
  show(index)
  // Below md the captions sit under the sticky map, so a step chosen from the
  // map or the arrows can be off screen, or half of it; each item's scroll
  // margin keeps it clear of the map when this brings it up.
  itemRefs.value[index]?.scrollIntoView?.({ block: 'nearest' })
}

function back(): void {
  // Back and Next stay focusable at either end, announced as unavailable
  // rather than disabled: a disabled button drops focus to the page, and a
  // keyboard user stepping through would be thrown out of the tour.
  if (activeIndex.value !== null && !atFirst.value) reveal(activeIndex.value - 1)
}

function next(): void {
  if (activeIndex.value === null) reveal(0)
  else if (!atLast.value) reveal(activeIndex.value + 1)
}

function toggle(index: number): void {
  if (activeIndex.value === index) show(null)
  else reveal(index)
}

function selectPart(part: SampleMapPart): void {
  reveal(stepForPart(part))
}
</script>

<template>
  <div class="mt-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] md:gap-8">
    <!-- Below md the map sticks under the 64px site header so the step being
         read and the parts it lights stay on screen together. -->
    <figure class="sticky top-16 z-10 m-0 bg-white pt-3 pb-3 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-white after:content-[''] md:top-24 md:self-start md:pt-0 md:after:hidden">
      <div class="overflow-hidden rounded-(--radius-box) border border-border bg-surface">
        <SampleMap
          class="max-h-[32vh] md:max-h-none"
          :focus="focus"
          @select-part="selectPart"
        />
      </div>
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          :class="STEP_BUTTON_CLASS"
          :aria-disabled="atFirst ? 'true' : undefined"
          @click="back"
        >
          Back
        </button>
        <p class="font-body text-caption m-0 flex flex-1 items-baseline justify-center gap-3 text-ink-muted tabular-nums">
          <span data-testid="map-tour-counter">{{ counter }}</span>
          <button
            v-if="activeIndex !== null"
            type="button"
            class="cursor-pointer text-ink underline decoration-ink-faint underline-offset-4 hover:decoration-ink"
            @click="show(null)"
          >
            Show all
          </button>
        </p>
        <button
          type="button"
          :class="STEP_BUTTON_CLASS"
          :aria-disabled="atLast ? 'true' : undefined"
          @click="next"
        >
          Next
        </button>
      </div>
    </figure>

    <ol
      class="m-0 mt-4 flex list-none flex-col gap-1 p-0 md:mt-0"
      data-testid="map-tour-steps"
    >
      <li
        v-for="(step, index) in TOUR_STEPS"
        :key="step.id"
        ref="itemRefs"
        class="border-l-2 py-2 pl-4 transition-colors duration-300 ease-(--ease-smooth) max-md:scroll-mt-[calc(32vh+9.5rem)] md:scroll-mt-24"
        :class="activeIndex === index ? 'border-coral text-ink' : 'border-transparent text-ink-muted'"
      >
        <button
          type="button"
          class="font-body text-body flex w-full cursor-pointer items-center gap-3 text-left font-semibold"
          :class="activeIndex === index ? 'text-ink-true' : 'text-ink hover:text-ink-true'"
          :aria-pressed="activeIndex === index"
          @click="toggle(index)"
        >
          <span
            class="flex w-7 shrink-0 items-center justify-center"
            aria-hidden="true"
          >
            <span
              v-if="step.swatch === 'origin-fill' || step.swatch === 'egress-fill'"
              class="inline-block h-3.5 w-7 rounded-[3px] opacity-85"
              :style="{ backgroundColor: step.swatch === 'origin-fill' ? paint.origin : paint.egress }"
            />
            <svg
              v-else
              width="28"
              height="16"
              viewBox="0 0 28 16"
            >
              <g
                v-if="step.swatch === 'start'"
                transform="translate(14 15.5) scale(0.75)"
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
              <template v-else-if="step.swatch === 'walk'">
                <line
                  x1="7"
                  y1="8"
                  x2="19"
                  y2="8"
                  :stroke="paint.origin"
                  :stroke-width="paint.walkWidth"
                  stroke-linecap="round"
                  :stroke-dasharray="paint.walkDash"
                />
                <circle
                  cx="3.5"
                  cy="8"
                  r="2.5"
                  :fill="paint.pin"
                />
                <circle
                  cx="23.5"
                  cy="8"
                  r="3.25"
                  :fill="paint.reachedStation"
                  :stroke="paint.ink"
                  stroke-width="1.5"
                />
              </template>
              <g
                v-else-if="step.swatch === 'stations'"
                :stroke="paint.ink"
                stroke-width="1.5"
              >
                <circle
                  cx="7"
                  cy="8"
                  r="4"
                  :fill="paint.reachedStation"
                />
                <circle
                  cx="21"
                  cy="8"
                  r="4"
                  :fill="paint.unreachedStation"
                />
              </g>
              <template v-else-if="step.swatch === 'unfinished'">
                <line
                  x1="2"
                  y1="8"
                  x2="19"
                  y2="8"
                  :stroke="paint.ink"
                  :stroke-width="paint.lineWidth"
                  stroke-linecap="round"
                  stroke-dasharray="2.5 7"
                />
                <circle
                  cx="23.5"
                  cy="8"
                  :r="paint.capRadius"
                  :fill="paint.ink"
                />
              </template>
              <line
                v-else
                x1="2"
                y1="8"
                x2="26"
                y2="8"
                :stroke="step.swatch === 'ridden' ? paint.ink : paint.unridden"
                :stroke-width="paint.lineWidth"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <span>{{ step.name }}</span>
        </button>
        <p class="font-body text-caption mt-1 mb-0 pl-10">
          {{ step.caption }}
        </p>
      </li>
    </ol>

    <p
      class="sr-only"
      aria-live="polite"
      aria-atomic="true"
      data-testid="map-tour-status"
    >
      {{ announcement }}
    </p>
  </div>
</template>
