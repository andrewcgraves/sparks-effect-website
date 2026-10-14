<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useScrollSteps } from '../composables/useScrollSteps'
import KeySwatch from './KeySwatch.vue'
import TourMap from './TourMap.vue'
import { TOUR_STEPS } from './tourSteps'

const items = ref<HTMLElement[]>([])
const { active, choose } = useScrollSteps(items)
const activeStep = computed(() => (active.value === null ? null : TOUR_STEPS[active.value]))
const announcement = ref('')
// Until the page is live every card reads at full strength: the dimming is a
// reading aid layered on top, not what makes a caption visible.
const enhanced = ref(false)

watch(activeStep, (step) => {
  announcement.value = step ? `Highlighting: ${step.name}` : ''
})

onMounted(() => {
  enhanced.value = true
})

const lit = (index: number) => !enhanced.value || active.value === null || active.value === index
</script>

<template>
  <section class="mx-auto w-full max-w-[1600px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:px-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-12 xl:px-8">
    <!-- On a phone the map is a band pinned under the 64px header with the
         steps scrolling beneath it; beside the steps it fills the column's
         height, 24px clear of the header and the bottom of the screen. -->
    <div class="sticky top-16 z-10 h-[55svh] border-y border-border bg-surface lg:top-[5.5rem] lg:h-[calc(100svh-7rem)] lg:self-start lg:border-0 lg:bg-transparent">
      <TourMap :step="activeStep" />
    </div>

    <!-- On a phone each step is about as tall as the strip left under the
         map, so the card being read is the one in view; its scroll margin
         brings a chosen card out from beneath the map rather than behind it. -->
    <ol
      class="relative m-0 list-none p-0 px-4 pt-6 pb-[40svh] sm:px-6 lg:px-0 lg:pt-[10svh] lg:pb-[40svh]"
      data-testid="map-tour-steps"
    >
      <li
        v-for="(step, index) in TOUR_STEPS"
        :key="step.id"
        ref="items"
        class="flex min-h-[36svh] scroll-mt-[calc(55svh+5rem)] items-start lg:min-h-[80svh] lg:scroll-mt-0 lg:items-center"
        :data-step-index="index"
      >
        <div
          class="w-full rounded-2xl border border-border bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)] transition-opacity duration-300 ease-(--ease-smooth) focus-within:opacity-100 xl:p-6"
          :class="lit(index) ? 'opacity-100' : 'opacity-40'"
        >
          <h3 class="m-0 flex items-center gap-3">
            <KeySwatch
              :kind="step.swatch"
              class="shrink-0"
            />
            <button
              type="button"
              class="font-body text-body cursor-pointer text-left font-semibold text-ink-true"
              :aria-current="active === index ? 'step' : undefined"
              @click="choose(index)"
              @focus="choose(index)"
            >
              {{ step.name }}
            </button>
          </h3>
          <p class="font-body text-body mt-2 mb-0 text-ink-muted">
            {{ step.caption }}
          </p>
        </div>
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
  </section>
</template>
