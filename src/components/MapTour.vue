<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import KeySwatch from './KeySwatch.vue'
import TourMap from './TourMap.vue'
import { TOUR_WIDE_QUERY, matchesMedia } from '../composables/media'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { TILE_CLASS, TILE_HEADING_CLASS } from './tileStyles'
import { NO_INSET, type TourInset } from './tourInset'
import { TOUR_STEPS } from './tourSteps'

const active = ref(0)
const activeStep = computed(() => TOUR_STEPS[active.value])
const isLast = computed(() => active.value === TOUR_STEPS.length - 1)
const announcement = ref('')

watch(activeStep, (step) => {
  announcement.value = `Step ${active.value + 1} of ${TOUR_STEPS.length}: ${step.name}. ${step.caption}`
})

function back(): void {
  if (active.value > 0) active.value--
}

function next(): void {
  active.value = isLast.value ? 0 : active.value + 1
}

const tour = ref<HTMLElement | null>(null)
const card = ref<HTMLElement | null>(null)
const inset = ref<TourInset>(NO_INSET)
let resize: ResizeObserver | null = null

function measure(): void {
  // Measured rather than worked out from the gutter and the card's width, so
  // the map frames itself around wherever the card has actually landed.
  let left = 0
  if (tour.value && card.value && matchesMedia(TOUR_WIDE_QUERY)) {
    left = Math.max(0, card.value.getBoundingClientRect().right - tour.value.getBoundingClientRect().left)
  }
  if (left !== inset.value.left) inset.value = { ...NO_INSET, left }
}

onMounted(() => {
  measure()
  if (!tour.value || typeof ResizeObserver === 'undefined') return
  resize = new ResizeObserver(measure)
  resize.observe(tour.value)
})

onUnmounted(() => resize?.disconnect())
</script>

<template>
  <!-- On a phone the card sits under the map. From lg the map runs the full
       width of the window and the card floats over its left side, its edge on
       the gutter like the wordmark above it; it stays after the map in the
       DOM, so it is still read and tabbed to after the map's caption. -->
  <section
    ref="tour"
    class="relative w-full"
    aria-label="Tour of a splash zone"
  >
    <div class="h-[50svh] border-y border-border bg-surface lg:h-[min(75svh,44rem)]">
      <TourMap
        :step="activeStep"
        :inset="inset"
      />
    </div>

    <!-- The same tile as the plot page's Time remaining and Time between
         stations, so a card that explains the map looks like the ones beside
         it; over the map it takes a shadow to read as floating. -->
    <div
      ref="card"
      :class="[
        TILE_CLASS,
        'mx-4 mt-4 sm:mx-6 lg:absolute lg:top-1/2 lg:left-(--page-gutter) lg:z-10 lg:m-0 lg:w-[340px] lg:-translate-y-1/2 lg:shadow-(--shadow-panel) xl:w-[400px]',
      ]"
      data-testid="map-tour-card"
    >
      <p class="t-meta m-0 text-ink-muted">
        Step {{ active + 1 }} of {{ TOUR_STEPS.length }}
      </p>
      <!-- Every step shares one cell, the ones not shown kept invisible, so
           the card is as tall as its longest caption and Back and Next stay
           put under the reader's thumb from step to step. -->
      <div class="mt-2 grid">
        <div
          v-for="(step, index) in TOUR_STEPS"
          :key="step.id"
          class="col-start-1 row-start-1"
          :class="index === active ? 'visible' : 'invisible'"
          :aria-hidden="index === active ? undefined : 'true'"
          :data-step="step.id"
        >
          <h3
            class="m-0 flex items-center gap-3"
            :class="TILE_HEADING_CLASS"
          >
            <KeySwatch
              :kind="step.swatch"
              class="shrink-0"
            />
            {{ step.name }}
          </h3>
          <p class="font-body text-body mt-2 mb-0 text-ink-muted">
            {{ step.caption }}
          </p>
        </div>
      </div>
      <div class="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          :class="[SECONDARY_BUTTON_CLASS, 'min-h-11 px-4']"
          :disabled="active === 0"
          data-testid="map-tour-back"
          @click="back"
        >
          Back
        </button>
        <button
          type="button"
          :class="[PRIMARY_BUTTON_CLASS, 'min-h-11']"
          data-testid="map-tour-next"
          @click="next"
        >
          {{ isLast ? 'Start over' : 'Next' }}
        </button>
      </div>
    </div>

    <p
      class="sr-only"
      aria-live="polite"
      aria-atomic="true"
      data-testid="map-tour-status"
    >
      {{ announcement }}
    </p>
  </section>
</template>
