<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant B, "Editorial split": type leads.
// A big pitch and the three steps on the left, the splash zone on the right as
// an annotated drawing with no tiles at all; featured lines as a ruled list of
// rows rather than cards.
import { computed } from 'vue'
import { PITCH, STEPS, visibleLines, type HomeData } from './homePrototypeData'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import SplashSvg from './SplashSvg.vue'
import RouteThumb from './RouteThumb.vue'
import LinesStatus from './LinesStatus.vue'

const props = defineProps<{ data: HomeData }>()
const shown = computed(() => visibleLines(props.data))
const reachedCount = computed(() => props.data.hero.chain.metadata.reachable_stations.length)
</script>

<template>
  <main class="flex flex-1 flex-col p-(--page-padding)">
    <section class="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div>
        <p class="font-display text-btn text-coral uppercase">
          Sparks Effect
        </p>
        <h1 class="font-display text-display mt-4 text-ink-true">
          What if the train were already here?
        </h1>
        <p class="font-body text-lead mt-6 max-w-[520px] text-ink-muted">
          {{ PITCH }}
        </p>
        <router-link
          to="/scenario/ca-hsr"
          :class="[PRIMARY_BUTTON_CLASS, 'mt-8 inline-block']"
        >
          Explore a line
        </router-link>

        <ol class="mt-12 flex max-w-[520px] flex-col divide-y divide-border border-y border-border">
          <li
            v-for="(step, i) in STEPS"
            :key="step.title"
            class="grid grid-cols-[2rem_1fr] gap-x-3 py-3"
          >
            <span class="font-display text-h3 text-ink-faint">0{{ i + 1 }}</span>
            <span class="font-display text-h3 text-ink-true">{{ step.title }}</span>
            <span class="font-body text-caption col-start-2 text-ink-muted">{{ step.body }}</span>
          </li>
        </ol>
        <router-link
          to="/how-it-works"
          class="font-body text-caption mt-3 inline-block underline hover:text-coral"
        >
          How it works, in detail
        </router-link>
      </div>

      <figure class="rounded-(--radius-box) bg-surface p-4">
        <SplashSvg
          :hero="data.hero"
          :width="640"
          :height="560"
        />
        <figcaption class="font-body text-caption mt-2 flex flex-col gap-1 border-t border-border pt-3 text-ink-muted">
          <span class="font-display text-btn text-ink uppercase">{{ data.hero.label }}</span>
          <span>
            Blue is where you can walk in time to catch a train. Orange is everywhere you can still reach from
            the {{ reachedCount }} stations you get to.
          </span>
        </figcaption>
      </figure>
    </section>

    <section class="mt-20">
      <div class="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-2">
        <h2 class="font-display text-h2 text-ink-true">
          Featured lines
        </h2>
        <router-link
          to="/services"
          class="font-display text-btn text-ink-muted uppercase hover:text-coral"
        >
          See all lines →
        </router-link>
      </div>
      <div class="mt-3">
        <LinesStatus
          :failed="shown.failed"
          :unavailable="shown.unavailable"
          :empty="shown.lines.length === 0"
        />
      </div>
      <ul class="divide-y divide-border">
        <li
          v-for="line in shown.lines"
          :key="`${line.kind}:${line.slug}`"
        >
          <router-link
            :to="line.to"
            class="group grid grid-cols-[96px_1fr_auto] items-center gap-5 py-4"
          >
            <RouteThumb
              :line="line"
              :width="96"
              :height="64"
              class="rounded-(--radius-field)"
            />
            <span class="flex flex-col">
              <span class="font-display text-h3 text-ink-true group-hover:text-coral">{{ line.name }}</span>
              <span class="font-body text-caption text-ink-muted">{{ line.caption }}</span>
            </span>
            <span class="font-display text-h3 text-ink-faint transition-transform duration-200 group-hover:translate-x-1 group-hover:text-coral">→</span>
          </router-link>
        </li>
      </ul>
    </section>
  </main>
</template>
