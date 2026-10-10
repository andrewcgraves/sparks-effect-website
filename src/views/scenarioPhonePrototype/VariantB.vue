<script setup lang="ts">
// PROTOTYPE (SPA-429) — Variant B, "Search on the map". The question lives on
// the map as a floating search card with chips (place · time · mode · Go); the
// sheet only ever holds answers — ready-made plots before you ask, Time
// remaining after. No IsochroneForm on phones at all.
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AddressAutocomplete from '../../components/AddressAutocomplete.vue'
import MapView from '../../components/MapView.vue'
import PrerenderedIsochrones from '../../components/PrerenderedIsochrones.vue'
import TimeBetweenStations from '../../components/TimeBetweenStations.vue'
import TimeRemaining from '../../components/TimeRemaining.vue'
import { getCurrentPosition } from '../../api/geolocation'
import type { GeocodingSuggestion } from '../../api/geocoding'
import PrototypeBottomSheet from './PrototypeBottomSheet.vue'
import { DURATION_OPTIONS, MODE_LABEL, PHONE_PAGE, type Mode } from './pageContext'

const page = inject(PHONE_PAGE)!

const placeLabel = ref('')
const duration = ref(60)
const mode = ref<Mode>('walk')
const pickArmed = ref(false)
const locating = ref(false)
const snap = ref(0)

const reached = computed(() => page.isochroneData?.metadata.reachable_stations.length ?? 0)
const canGo = computed(() => !!page.origin && !page.isLoading)

function onSelect(s: GeocodingSuggestion) {
  pickArmed.value = false
  placeLabel.value = s.label
  page.setOrigin({ lat: s.lat, lng: s.lng })
}

function onMapClick(coord: { lat: number; lng: number }) {
  if (!pickArmed.value) return
  pickArmed.value = false
  placeLabel.value = `Dropped pin · ${coord.lat.toFixed(3)}, ${coord.lng.toFixed(3)}`
  page.setOrigin(coord)
}

async function useMyLocation() {
  pickArmed.value = false
  locating.value = true
  try {
    const pos = await getCurrentPosition()
    placeLabel.value = 'My location'
    page.setOrigin(pos)
  } catch {
    placeLabel.value = 'Couldn’t get your location'
  } finally {
    locating.value = false
  }
}

function go() {
  if (!page.origin) return
  void page.submit({ ...page.origin, duration: duration.value, mode: mode.value })
}

watch(pickArmed, (armed) => {
  if (armed) snap.value = 0
})
watch(
  () => page.isochroneData,
  (data) => {
    if (data && snap.value === 0) snap.value = 1
  },
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') pickArmed.value = false
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="fixed inset-0 z-10 bg-white">
    <div class="phone-map absolute inset-0">
      <MapView
        label="Splash zone map"
        :origin="page.origin"
        :isochrone-data="page.isochroneData"
        :loading="page.isLoading"
        :routes="page.routes"
        :stations="page.stations"
        :services="page.services"
        :placement-armed="pickArmed"
        :active-station="page.activeStation?.slug ?? null"
        hide-isochrone-legend
        @map-click="onMapClick"
        @station-hover="page.highlight($event, true)"
      />
    </div>

    <!-- The whole question, floating over the map. -->
    <div class="absolute inset-x-3 top-3 z-30 flex flex-col gap-2 rounded-2xl bg-white p-3 shadow-[0_2px_12px_rgb(0_0_0/0.18)]">
      <div class="flex items-end gap-2">
        <div class="min-w-0 flex-1">
          <AddressAutocomplete @select="onSelect" />
        </div>
        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-full border border-border text-[18px]"
          :class="pickArmed ? 'border-coral bg-coral text-white' : ''"
          :aria-pressed="pickArmed"
          aria-label="Drop a pin on the map"
          @click="pickArmed = !pickArmed"
        >
          📍
        </button>
        <button
          type="button"
          class="grid size-10 shrink-0 place-items-center rounded-full border border-border text-[18px] disabled:opacity-50"
          aria-label="Use my location"
          :disabled="locating"
          @click="useMyLocation"
        >
          ◎
        </button>
      </div>
      <p
        v-if="pickArmed"
        class="font-body text-caption text-coral"
        aria-live="polite"
      >
        Tap the map to set your starting point
      </p>
      <p
        v-else-if="placeLabel"
        class="font-body text-caption truncate text-ink-muted italic"
      >
        {{ placeLabel }}
      </p>
      <div class="flex items-center gap-1.5 overflow-x-auto">
        <label class="relative shrink-0">
          <span class="sr-only">Travel time</span>
          <select
            class="font-body text-caption appearance-none rounded-full border border-border bg-surface py-1.5 pr-7 pl-3 text-ink"
            @change="duration = Number(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="d in DURATION_OPTIONS"
              :key="d"
              :value="d"
              :selected="d === duration"
            >{{ d }} min</option>
          </select>
          <span class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-ink-muted">▾</span>
        </label>
        <button
          v-for="(label, key) in MODE_LABEL"
          :key="key"
          type="button"
          class="font-body text-caption shrink-0 rounded-full border px-3 py-1.5"
          :class="mode === key ? 'border-ink bg-ink text-white' : 'border-border bg-surface text-ink-muted'"
          :aria-pressed="mode === key"
          @click="mode = key"
        >
          {{ label }}
        </button>
        <button
          type="button"
          class="font-display text-btn ml-auto shrink-0 rounded-full bg-coral px-4 py-2 text-white uppercase disabled:opacity-40"
          :disabled="!canGo"
          @click="go"
        >
          {{ page.isLoading ? '…' : 'Go' }}
        </button>
      </div>
      <p
        v-if="page.fetchError"
        class="font-body text-caption text-coral"
        role="alert"
      >
        {{ page.fetchError }}
      </p>
    </div>

    <PrototypeBottomSheet
      v-model="snap"
      :snaps="[120, 0.5, 0.92]"
      label="results"
    >
      <template #header>
        <div class="border-b border-border px-4 pb-3">
          <template v-if="reached">
            <p class="font-display text-[17px] font-bold text-ink-true">
              {{ reached }} stations within {{ page.isochroneData?.metadata.origin_budget_mins ?? duration }} min
            </p>
            <p class="font-body text-caption text-ink-muted">
              {{ page.name }} · swipe up for times
            </p>
          </template>
          <template v-else>
            <p class="font-display text-[17px] font-bold text-ink-true">
              {{ page.name || 'Sparks Effect' }}
            </p>
            <p class="font-body text-caption text-ink-muted">
              Search a place above — or try a ready-made plot ↑
            </p>
          </template>
        </div>
      </template>

      <div class="flex flex-col gap-4 p-4 pb-12">
        <TimeRemaining
          v-if="page.timeRemaining.views.length"
          :views="page.timeRemaining.views"
          :active-slug="page.activeStation?.slug ?? null"
          :active-from-map="page.activeStation?.fromMap ?? false"
          @activate="page.highlight($event, false)"
        />
        <PrerenderedIsochrones
          v-model:selected-id="page.selectedPrerenderedId"
          :slug="page.slug"
          @select="page.showIsochrone"
        />
        <TimeBetweenStations
          v-if="!page.travelTimesFailed"
          :groups="page.stationTimeGroups"
          :loading="page.travelTimesLoading"
        />
        <section>
          <h2 class="font-display text-h3 text-ink-true">
            About this route
          </h2>
          <p class="font-body text-body mt-2 text-ink-muted">
            {{ page.description || '—' }}
          </p>
        </section>
      </div>
    </PrototypeBottomSheet>
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
