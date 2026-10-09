<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant C, "Step-through": the "how it
// works" steps are the hero. Each step builds the splash zone up a layer, and
// it plays itself until the visitor takes over. Featured lines are schematic
// posters (stations evenly spaced, transit-diagram style), not map outlines.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { PITCH, STEPS, visibleLines, type HomeData } from './homePrototypeData'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import SplashSvg from './SplashSvg.vue'
import LinesStatus from './LinesStatus.vue'

const props = defineProps<{ data: HomeData }>()
const shown = computed(() => visibleLines(props.data))

const stage = ref<1 | 2 | 3>(1)
let timer: ReturnType<typeof setInterval> | null = null

function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function pick(i: number): void {
  stop()
  stage.value = (i + 1) as 1 | 2 | 3
}

onMounted(() => {
  timer = setInterval(() => {
    stage.value = stage.value === 3 ? 1 : ((stage.value + 1) as 2 | 3)
  }, 2800)
})
onBeforeUnmount(stop)

function schematic(names: string[]): { name: string; x: number }[] {
  const n = Math.max(names.length - 1, 1)
  return names.map((name, i) => ({ name, x: 16 + (i / n) * 1068 }))
}

function anchorX(x: number, i: number, count: number): number {
  return i === 0 ? x - 6 : i === count - 1 ? x + 6 : x
}
</script>

<template>
  <main class="flex flex-1 flex-col">
    <section class="bg-slate px-(--page-gutter) pt-12 pb-16 text-white">
      <h1 class="font-display text-display max-w-[900px]">
        Where could a train line that doesn’t exist yet take you?
      </h1>
      <p class="font-body text-lead mt-5 max-w-[640px] text-white/75">
        {{ PITCH }}
      </p>

      <div class="mt-10 grid items-center gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <ol class="flex flex-col gap-2">
          <li
            v-for="(step, i) in STEPS"
            :key="step.title"
          >
            <button
              type="button"
              class="w-full cursor-pointer rounded-(--radius-box) border-l-4 px-4 py-3 text-left transition-colors duration-300"
              :class="stage === i + 1 ? 'border-coral bg-white/10' : 'border-transparent hover:bg-white/5'"
              :aria-pressed="stage === i + 1"
              @click="pick(i)"
            >
              <span class="font-display text-micro text-white/60 uppercase">Step {{ i + 1 }}</span>
              <span class="font-display text-h3 block">{{ step.title }}</span>
              <span
                class="font-body text-caption block text-white/70 transition-all duration-300"
                :class="stage === i + 1 ? 'max-h-20 opacity-100' : 'max-h-0 overflow-hidden opacity-0'"
              >{{ step.body }}</span>
            </button>
          </li>
          <li class="mt-4 flex flex-wrap items-center gap-4 px-4">
            <router-link
              to="/scenario/ca-hsr"
              :class="PRIMARY_BUTTON_CLASS"
            >
              Try it on a real line
            </router-link>
            <router-link
              to="/how-it-works"
              class="font-body text-caption text-white/70 underline hover:text-white"
            >
              The method
            </router-link>
          </li>
        </ol>

        <figure class="rounded-(--radius-box) bg-white p-3 text-ink">
          <SplashSvg
            :hero="data.hero"
            :stage="stage"
            :width="760"
            :height="460"
          />
          <figcaption class="font-body text-caption px-2 pt-1 text-ink-muted">
            {{ data.hero.label }} on California High-Speed Rail
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="px-(--page-gutter) py-14">
      <h2 class="font-display text-h2 text-ink-true">
        Lines to explore
      </h2>
      <div class="mt-3">
        <LinesStatus
          :failed="shown.failed"
          :unavailable="shown.unavailable"
          :empty="shown.lines.length === 0"
        />
      </div>
      <ul class="mt-6 flex flex-col gap-6">
        <li
          v-for="line in shown.lines"
          :key="`${line.kind}:${line.slug}`"
        >
          <router-link
            :to="line.to"
            class="group block rounded-(--radius-box) border border-border p-5 transition-colors duration-200 hover:border-coral"
          >
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <span class="font-display text-card-title text-ink-true group-hover:text-coral">{{ line.name }}</span>
              <span class="font-body text-caption text-ink-muted">{{ line.caption }}</span>
            </div>
            <svg
              viewBox="0 0 1100 64"
              class="mt-4 block h-auto w-full"
              role="img"
              :aria-label="`${line.name}: ${line.stations.map((s) => s.name).join(', ')}`"
            >
              <template v-if="line.stations.length > 1">
                <line
                  x1="16"
                  x2="1084"
                  y1="20"
                  y2="20"
                  class="stroke-coral"
                  stroke-width="6"
                  stroke-linecap="round"
                />
                <g
                  v-for="(s, i) in schematic(line.stations.map((st) => st.name))"
                  :key="s.name"
                >
                  <circle
                    :cx="s.x"
                    cy="20"
                    r="6"
                    class="fill-white stroke-ink"
                    stroke-width="2.5"
                  />
                  <text
                    :x="anchorX(s.x, i, line.stations.length)"
                    :y="i % 2 ? 58 : 44"
                    :text-anchor="i === 0 ? 'start' : i === line.stations.length - 1 ? 'end' : 'middle'"
                    class="fill-ink-muted font-body"
                    font-size="11"
                  >{{ s.name }}</text>
                </g>
              </template>
              <text
                v-else
                x="550"
                y="36"
                text-anchor="middle"
                class="fill-ink-muted font-body"
                font-size="11"
              >No stations in the published index</text>
            </svg>
          </router-link>
        </li>
      </ul>
      <router-link
        to="/services"
        class="font-display text-btn mt-6 inline-block text-ink-muted uppercase hover:text-coral"
      >
        See every line →
      </router-link>
    </section>
  </main>
</template>
