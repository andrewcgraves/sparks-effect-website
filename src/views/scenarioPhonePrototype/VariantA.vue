<script setup lang="ts">
// PROTOTYPE (SPA-429) — Variant A, "Snap sheet": the ticket as written.
// Full-bleed map; one draggable sheet with peek / half / full snaps. Peek is a
// one-line summary with a Plot button; plotting raises the sheet to half with
// the result on top.
import { computed, inject, nextTick, ref, watch } from 'vue'
import IsochroneForm from '../../IsochroneForm.vue'
import MapView from '../../components/MapView.vue'
import PrerenderedIsochrones from '../../components/PrerenderedIsochrones.vue'
import TimeBetweenStations from '../../components/TimeBetweenStations.vue'
import TimeRemaining from '../../components/TimeRemaining.vue'
import { ORIGIN_PICK_CUE } from '../../components/placementCues'
import PrototypeBottomSheet from './PrototypeBottomSheet.vue'
import { MODE_LABEL, PHONE_PAGE } from './pageContext'

const page = inject(PHONE_PAGE)!
// The useOriginPick relay, inline: this variant also needs its own handle on
// the form for the peek row.
const pickArmed = ref(false)
const isochroneForm = ref<InstanceType<typeof IsochroneForm> | null>(null)
function onMapClick(coord: { lat: number; lng: number }) {
  isochroneForm.value?.setOriginFromMap(coord)
}
const scroller = ref<HTMLElement | null>(null)

const TOP_BAR = 48
const snap = ref(0)

const summary = computed(() => isochroneForm.value?.summary)
const reached = computed(() => page.isochroneData?.metadata.reachable_stations.length ?? 0)

// The map is what the user is aiming at while picking, so get the sheet out
// of its way.
watch(pickArmed, (armed) => {
  if (armed) snap.value = 0
})

// A fresh answer raises the sheet to half and puts the result in view.
watch(
  () => page.isochroneData,
  async (data) => {
    if (!data) return
    if (snap.value === 0) snap.value = 1
    await nextTick()
    scroller.value?.scrollIntoView({ block: 'start' })
  },
)
</script>

<template>
  <div class="fixed inset-0 z-10 bg-white">
    <header
      class="absolute inset-x-0 top-0 z-30 flex items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur"
      :style="{ height: `${TOP_BAR}px` }"
    >
      <h1 class="font-display min-w-0 flex-1 truncate text-[17px] font-bold text-ink-true">
        {{ page.name || 'Sparks Effect' }}
      </h1>
      <span class="font-body text-micro shrink-0 text-ink-muted uppercase">Route</span>
    </header>

    <div
      class="phone-map absolute inset-x-0 bottom-0"
      :style="{ top: `${TOP_BAR}px` }"
    >
      <MapView
        label="Splash zone map"
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

    <PrototypeBottomSheet
      v-model="snap"
      :snaps="[104, 0.5, 0.97]"
      :top-offset="TOP_BAR"
      label="plot controls"
    >
      <template #header>
        <div class="flex items-center gap-3 border-b border-border px-4 pb-3">
          <div class="min-w-0 flex-1">
            <template v-if="reached">
              <p class="font-display truncate text-[15px] font-bold text-ink-true">
                {{ reached }} stations reached
              </p>
              <p class="font-body text-caption truncate text-ink-muted">
                {{ summary?.duration }} min · {{ MODE_LABEL[summary?.mode ?? 'walk'] }} · {{ summary?.place }}
              </p>
            </template>
            <template v-else>
              <p class="font-display truncate text-[15px] font-bold text-ink-true">
                {{ summary?.place || 'Tap the map or search a place' }}
              </p>
              <p class="font-body text-caption truncate text-ink-muted">
                {{ summary?.duration ?? 60 }} min · {{ MODE_LABEL[summary?.mode ?? 'walk'] }} ·
                <button
                  type="button"
                  class="text-coral underline"
                  @click="snap = 1"
                >
                  change
                </button>
              </p>
            </template>
          </div>
          <button
            v-if="summary?.place"
            type="button"
            class="font-display text-btn shrink-0 rounded-(--radius-field) bg-coral px-5 py-3 text-white uppercase disabled:opacity-50"
            :disabled="!summary?.canPlot"
            @click="isochroneForm?.submit()"
          >
            {{ page.isLoading ? '…' : reached ? 'Re-plot' : 'Plot' }}
          </button>
          <button
            v-else
            type="button"
            class="font-display text-btn shrink-0 rounded-(--radius-field) border border-coral px-4 py-3 text-coral uppercase"
            :class="pickArmed ? 'bg-coral text-white' : ''"
            @click="pickArmed ? (pickArmed = false) : isochroneForm?.armPick()"
          >
            {{ pickArmed ? 'Cancel' : '📍 Tap map' }}
          </button>
        </div>
      </template>

      <div class="flex flex-col gap-4 p-4 pb-12">
        <div ref="scroller" />
        <TimeRemaining
          v-if="page.timeRemaining.views.length"
          :views="page.timeRemaining.views"
          :active-slug="page.activeStation?.slug ?? null"
          :active-from-map="page.activeStation?.fromMap ?? false"
          @activate="page.highlight($event, false)"
        />
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
