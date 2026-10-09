<script setup lang="ts">
// PROTOTYPE (SPA-429) — Variant C, "Split + tabs". No gestures: the map takes
// the top of the screen, a fixed panel the bottom, and the panel's content is
// split into tabs (Plot · Results · Stations · About) so nothing scrolls past
// anything else. Plotting jumps to Results.
import { inject, ref, watch } from 'vue'
import IsochroneForm from '../../IsochroneForm.vue'
import MapView from '../../components/MapView.vue'
import PrerenderedIsochrones from '../../components/PrerenderedIsochrones.vue'
import TimeBetweenStations from '../../components/TimeBetweenStations.vue'
import TimeRemaining from '../../components/TimeRemaining.vue'
import { ORIGIN_PICK_CUE } from '../../components/placementCues'
import { useOriginPick } from '../../composables/useOriginPick'
import { PHONE_PAGE } from './pageContext'

type Tab = 'plot' | 'results' | 'stations' | 'about'

const page = inject(PHONE_PAGE)!
const { pickArmed, onMapClick } = useOriginPick()

const tab = ref<Tab>('plot')
// Panel height as a share of the screen: 'tall' gives the panel room to read,
// 'short' gives the map room to aim.
const panel = ref<'short' | 'tall'>('tall')

const TABS: { key: Tab; label: string }[] = [
  { key: 'plot', label: 'Plot' },
  { key: 'results', label: 'Results' },
  { key: 'stations', label: 'Stations' },
  { key: 'about', label: 'About' },
]

watch(pickArmed, (armed) => {
  panel.value = armed ? 'short' : 'tall'
})
watch(
  () => page.isochroneData,
  (data) => {
    if (data) tab.value = 'results'
  },
)
</script>

<template>
  <div class="fixed inset-0 z-10 flex flex-col bg-white">
    <header class="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <h1 class="font-display min-w-0 flex-1 truncate text-[17px] font-bold text-ink-true">
        {{ page.name || 'Sparks Effect' }}
      </h1>
      <button
        type="button"
        class="font-display text-btn shrink-0 text-ink-muted uppercase"
        :aria-label="panel === 'tall' ? 'Bigger map' : 'Bigger panel'"
        @click="panel = panel === 'tall' ? 'short' : 'tall'"
      >
        {{ panel === 'tall' ? '⤢ Map' : '⤡ Panel' }}
      </button>
    </header>

    <div class="phone-map relative min-h-0 flex-1">
      <MapView
        :origin="page.origin"
        :isochrone-data="page.isochroneData"
        :loading="page.isLoading"
        :routes="page.routes"
        :stations="page.stations"
        :services="page.services"
        :placement-armed="pickArmed"
        :placement-cue="ORIGIN_PICK_CUE"
        :active-station="page.activeStation?.slug ?? null"
        @map-click="onMapClick"
        @station-hover="page.highlight($event, true)"
      />
    </div>

    <section
      class="flex shrink-0 flex-col border-t border-border bg-white transition-[height] duration-300 ease-(--ease-smooth)"
      :style="{ height: panel === 'tall' ? '52dvh' : '24dvh' }"
    >
      <div
        role="tablist"
        aria-label="Route panel"
        class="flex shrink-0 border-b border-border"
      >
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          :aria-selected="tab === t.key"
          :disabled="t.key === 'results' && !page.timeRemaining.views.length"
          class="font-display text-btn relative flex-1 py-3 uppercase disabled:opacity-35"
          :class="tab === t.key ? 'text-coral' : 'text-ink-muted'"
          @click="tab = t.key; panel = 'tall'"
        >
          {{ t.label }}
          <span
            v-if="tab === t.key"
            class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-coral"
          />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <!-- v-show so the form keeps what was typed when flipping tabs. -->
        <div
          v-show="tab === 'plot'"
          role="tabpanel"
          class="flex flex-col gap-4"
        >
          <IsochroneForm
            ref="isochroneForm"
            :error="page.fetchError"
            :loading="page.isLoading"
            @submit="page.submit"
            @origin-change="page.setOrigin"
            @pick-armed="pickArmed = $event"
          />
          <PrerenderedIsochrones
            v-model:selected-id="page.selectedPrerenderedId"
            :slug="page.slug"
            @select="page.showIsochrone"
          />
        </div>
        <div
          v-show="tab === 'results'"
          role="tabpanel"
        >
          <TimeRemaining
            v-if="page.timeRemaining.views.length"
            :views="page.timeRemaining.views"
            :active-slug="page.activeStation?.slug ?? null"
            :active-from-map="page.activeStation?.fromMap ?? false"
            @activate="page.highlight($event, false)"
          />
        </div>
        <div
          v-show="tab === 'stations'"
          role="tabpanel"
        >
          <TimeBetweenStations
            v-if="!page.travelTimesFailed"
            :groups="page.stationTimeGroups"
            :loading="page.travelTimesLoading"
          />
        </div>
        <div
          v-show="tab === 'about'"
          role="tabpanel"
        >
          <p class="font-body text-micro text-ink-muted italic uppercase">
            Electrified · High-speed rail · Greenfield
          </p>
          <p class="font-body text-body mt-3 text-ink-muted">
            {{ page.description || '—' }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.phone-map :deep(.map-frame),
.phone-map :deep(.map-frame > div:first-child) {
  min-height: 0;
  border: 0;
  border-radius: 0;
}
</style>
