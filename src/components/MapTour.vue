<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import KeySwatch from './KeySwatch.vue'
import TourMap from './TourMap.vue'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'
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
</script>

<template>
  <!-- Beside the card, the tour runs gutter to gutter like the header: the map
       starts under the wordmark and the card ends under Sign in. -->
  <section
    class="w-full lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:gap-10 lg:px-(--page-gutter) xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12"
    aria-label="Tour of a splash zone"
  >
    <div class="h-[50svh] border-y border-border bg-surface lg:h-[min(75svh,44rem)] lg:border-0 lg:bg-transparent">
      <TourMap :step="activeStep" />
    </div>

    <div class="px-4 pt-4 sm:px-6 lg:px-0 lg:pt-0">
      <div
        class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)] xl:p-6"
        data-testid="map-tour-card"
      >
        <p class="font-body text-micro m-0 text-ink-muted">
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
            <h3 class="font-body text-body m-0 flex items-center gap-3 font-semibold text-ink-true">
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
