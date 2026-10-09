<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant A, "Map hero": the splash zone on
// real tiles fills the top of the page with the pitch floating over it; a
// numbered strip and a card grid follow underneath.
import { computed } from 'vue'
import { PITCH, STEPS, visibleLines, type HomeData } from './homePrototypeData'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import HeroTileMap from './HeroTileMap.vue'
import RouteThumb from './RouteThumb.vue'
import LinesStatus from './LinesStatus.vue'

const props = defineProps<{ data: HomeData }>()
const shown = computed(() => visibleLines(props.data))
</script>

<template>
  <main class="flex flex-1 flex-col">
    <section class="relative h-[min(78svh,680px)] min-h-[460px]">
      <HeroTileMap :hero="data.hero" />
      <div class="pointer-events-none absolute inset-0 flex items-end p-(--page-gutter) pb-10 md:items-center">
        <div class="pointer-events-auto max-w-[460px] rounded-(--radius-box) bg-white/95 p-6 shadow-(--shadow-panel) backdrop-blur">
          <h1 class="font-display text-display text-ink-true">
            Sparks Effect
          </h1>
          <p class="font-body text-lead mt-4 text-ink">
            {{ PITCH }}
          </p>
          <div class="mt-6 flex flex-wrap items-center gap-4">
            <router-link
              to="/scenario/ca-hsr"
              :class="PRIMARY_BUTTON_CLASS"
            >
              Explore a line
            </router-link>
            <span class="font-body text-caption text-ink-muted">
              On the map: {{ data.hero.label.toLowerCase() }}
            </span>
          </div>
          <p class="font-body text-caption mt-4 flex flex-wrap gap-x-4 gap-y-1 text-ink-muted">
            <span class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm bg-data-origin/35 ring-1 ring-data-origin" /> Walk to the station</span>
            <span class="flex items-center gap-1.5"><span class="inline-block size-3 rounded-sm bg-data-egress/35 ring-1 ring-data-egress" /> Reached by train</span>
          </p>
        </div>
      </div>
    </section>

    <section class="border-y border-border bg-surface px-(--page-gutter) py-10">
      <ol class="grid gap-6 md:grid-cols-3">
        <li
          v-for="(step, i) in STEPS"
          :key="step.title"
          class="flex gap-4"
        >
          <span class="font-display text-h2 text-coral">{{ i + 1 }}</span>
          <div>
            <h2 class="font-display text-h3 text-ink-true">
              {{ step.title }}
            </h2>
            <p class="font-body text-body mt-1 text-ink-muted">
              {{ step.body }}
            </p>
          </div>
        </li>
      </ol>
      <router-link
        to="/how-it-works"
        class="font-display text-btn mt-6 inline-block text-ink-muted uppercase hover:text-coral"
      >
        How the splash zone is calculated →
      </router-link>
    </section>

    <section class="px-(--page-gutter) py-12">
      <div class="flex items-baseline justify-between gap-4">
        <h2 class="font-display text-h2 text-ink-true">
          Featured lines
        </h2>
        <router-link
          to="/services"
          class="font-display text-btn text-ink-muted uppercase hover:text-coral"
        >
          See all →
        </router-link>
      </div>
      <div class="mt-4">
        <LinesStatus
          :failed="shown.failed"
          :unavailable="shown.unavailable"
          :empty="shown.lines.length === 0"
        />
      </div>
      <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="line in shown.lines"
          :key="`${line.kind}:${line.slug}`"
        >
          <router-link
            :to="line.to"
            class="group flex h-full flex-col overflow-hidden rounded-(--radius-box) border border-border bg-white transition-colors duration-200 hover:border-coral"
          >
            <RouteThumb
              :line="line"
              :width="400"
              :height="200"
              class="w-full"
            />
            <div class="flex flex-1 flex-col gap-1 p-4">
              <span class="font-display text-micro text-ink-muted uppercase">{{ line.kind === 'scenario' ? 'Network' : 'Line' }}</span>
              <span class="font-display text-card-title text-ink-true group-hover:text-coral">{{ line.name }}</span>
              <span class="font-body text-caption text-ink-muted">{{ line.caption }}</span>
            </div>
          </router-link>
        </li>
      </ul>
    </section>
  </main>
</template>
