<script setup lang="ts">
// PROTOTYPE (SPA-500) variant B — "Trip / Lines lenses". One card, two ways to
// read it. Before a plot only Lines exists. A plot opens on Trip: today's
// time-remaining graph in branching order, plus a "Not reached" tail so every
// station is still on the card. Lines is today's Time between stations.
import { computed, ref, watch } from 'vue'
import { TILE_CLASS, TILE_HEADING_CLASS } from '../tileStyles'
import SegmentedControl from '../SegmentedControl.vue'
import TimeRemaining from '../TimeRemaining.vue'
import TimeBetweenStations from '../TimeBetweenStations.vue'
import type { StationTimeGroup } from '../stationTimes'
import type { TimeRemainingView } from '../timeRemaining'
import { formatProgressPercent } from '../timeRemaining'
import type { CardData } from './model'

const props = defineProps<{
  data: CardData
  views: TimeRemainingView[]
  groups: StationTimeGroup[]
  loading?: boolean
  activeSlug: string | null
  activeFromMap?: boolean
}>()
const emit = defineEmits<{ activate: [slug: string | null] }>()

const lens = ref<'Trip' | 'Lines'>('Lines')
watch(() => props.data.plot, (plot) => { lens.value = plot ? 'Trip' : 'Lines' }, { immediate: true })

const notReached = computed(() => {
  const plot = props.data.plot
  if (!plot) return []
  return props.data.lines
    .map((line) => ({
      line,
      stops: line.stops
        .filter((slug) => !plot.bySlug.has(slug))
        .map((slug) => {
          const partial = plot.progress.find((p) => p.to === slug && line.stops.includes(p.from))
          return {
            slug,
            note: partial
              ? `${formatProgressPercent(partial.fraction)} of the way from ${props.data.name(partial.from)}`
              : null,
          }
        }),
    }))
    .filter((entry) => entry.stops.length)
})
const notReachedCount = computed(() => notReached.value.reduce((n, e) => n + e.stops.length, 0))
</script>

<template>
  <section
    :class="TILE_CLASS"
    data-testid="prototype-stations-b"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 :class="TILE_HEADING_CLASS">
        Stations
      </h2>
      <SegmentedControl
        v-if="props.data.plot"
        v-model="lens"
        :options="['Trip', 'Lines'] as const"
        label="Read stations by"
        name="b-lens"
      />
    </div>

    <!-- The two existing cards, borders and headings stripped, as the two lenses. -->
    <div class="[&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section>h2]:sr-only">
      <template v-if="lens === 'Trip' && props.data.plot">
        <TimeRemaining
          :views="props.views"
          :active-slug="props.activeSlug"
          :active-from-map="props.activeFromMap"
          @activate="emit('activate', $event)"
        />
        <details
          v-if="notReachedCount"
          class="group/b mt-3 border-t border-border pt-2"
        >
          <summary class="font-body text-caption flex cursor-pointer list-none gap-2 text-ink-muted [&::-webkit-details-marker]:hidden">
            <span class="inline-block w-2 transition-transform group-open/b:rotate-90">›</span>
            Not reached · {{ notReachedCount }} stations
          </summary>
          <div
            v-for="entry in notReached"
            :key="entry.line.key"
            class="mt-2 pl-4"
          >
            <h3 class="font-display text-micro text-ink-muted uppercase">
              {{ entry.line.label }}
            </h3>
            <ul class="mt-1 list-none p-0">
              <li
                v-for="stop in entry.stops"
                :key="stop.slug"
                class="font-body text-caption flex justify-between gap-3 py-0.5 text-ink-muted"
                tabindex="0"
                @mouseenter="emit('activate', stop.slug)"
                @mouseleave="emit('activate', null)"
              >
                <span>{{ props.data.name(stop.slug) }}</span>
                <span
                  v-if="stop.note"
                  class="text-micro italic"
                >{{ stop.note }}</span>
              </li>
            </ul>
          </div>
        </details>
      </template>
      <TimeBetweenStations
        v-else
        :groups="props.groups"
        :loading="props.loading"
      />
    </div>
  </section>
</template>
