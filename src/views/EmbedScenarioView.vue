<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { PLOT_WITHOUT_MAP } from '../components/mapLoad'
import PlotPanel from '../components/PlotPanel.vue'
import PrerenderedIsochrones from '../components/PrerenderedIsochrones.vue'
import EmbedPlotCard from '../components/embed/EmbedPlotCard.vue'
import EmbedSiteLink from '../components/embed/EmbedSiteLink.vue'
import EmbedUnavailable from '../components/embed/EmbedUnavailable.vue'
import { ORIGIN_PICK_CUE } from '../components/placementCues'
import { isochroneWaitMessage } from '../api/isochroneFault'
import { TRAVEL_MODES, type TravelMode } from '../api/authoring/types'
import type { PrerenderedIsochrone } from '../api/prerenderedIsochrones'
import { trackEmbedLoad } from '../analytics/index'
import { useScenario } from '../composables/useScenario'
import { useIsochrone } from '../composables/useIsochrone'
import { useIsochroneQuery } from '../composables/useIsochroneQuery'
import { useOriginPick } from '../composables/useOriginPick'
import { useRoutingStatus } from '../composables/useRoutingStatus'
import { fullPageHref } from '../embed/embedLinks'
import type { IsochronePayload } from '../isochroneQuery'

const props = defineProps<{ slug: string }>()

const route = useRoute()
// Fixed for the life of the frame: it is the embedder's choice, made once in
// the snippet they pasted.
const controls = route.query.controls === '1'

trackEmbedLoad(document.referrer)

const { routes, stations, failed } = useScenario(props.slug)
const { offline } = useRoutingStatus()
const { pickArmed, onMapClick, form: isochroneForm } = useOriginPick()

const origin = ref<{ lat: number; lng: number } | null>(null)
const hasExamples = ref<boolean | null>(null)
const selectedPrerenderedId = ref<string | null>(null)

const {
  data: isochroneData,
  loading: isLoading,
  error: fetchError,
  progress: isochroneProgress,
  generate,
  show: showIsochrone,
} = useIsochrone(() => stations.value, { offline: () => offline.value })

async function plot(payload: IsochronePayload): Promise<void> {
  selectedPrerenderedId.value = null
  origin.value = { lat: payload.lat, lng: payload.lng }
  await generate({
    lat: payload.lat,
    lng: payload.lng,
    budget_mins: payload.duration,
    mode: payload.mode,
    scenario_slug: props.slug,
  })
}

const { initial: linkedIsochrone, submit: submitIsochrone, forget: forgetIsochrone } = useIsochroneQuery({
  plot,
  plotted: () => isochroneData.value !== null && fetchError.value === null,
  ready: () => stations.value.length > 0,
})

// A saved splash zone is already drawn: no routing job, and nothing for the
// URL to name, so the site link opens the network as it is.
function onPrerenderedSelect(entry: PrerenderedIsochrone): void {
  showIsochrone(entry.result)
  void forgetIsochrone()
  origin.value = { lat: entry.lat, lng: entry.lng }
  const mode = TRAVEL_MODES.find((m): m is TravelMode => m === entry.mode)
  if (mode) isochroneForm.value?.fill({ lat: entry.lat, lng: entry.lng, duration: entry.budget_mins, mode })
}

const showExamples = computed(
  () => hasExamples.value === true && isochroneData.value === null && !isLoading.value,
)

const siteHref = computed(() => fullPageHref(window.location.origin, { kind: 'scenario', slug: props.slug }, route.query))
</script>

<template>
  <main
    class="@container relative h-svh overflow-hidden bg-white text-ink"
    data-testid="embed-root"
  >
    <EmbedUnavailable v-if="failed" />
    <template v-else>
      <MapView
        label="Splash zone map"
        :without-map="PLOT_WITHOUT_MAP"
        flush
        hide-isochrone-legend
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isLoading"
        :loading-message="isochroneWaitMessage(isochroneProgress)"
        :routes="routes"
        :stations="stations"
        :placement-armed="pickArmed"
        :placement-cue="ORIGIN_PICK_CUE"
        @map-click="onMapClick"
      >
        <template #attribution>
          <EmbedSiteLink :href="siteHref" />
        </template>
      </MapView>

      <EmbedPlotCard
        v-if="controls"
        :plot="isochroneData"
        :error="fetchError"
        :pick-armed="pickArmed"
        :start-open="linkedIsochrone.lat === undefined"
      >
        <PlotPanel
          :has-saved="hasExamples"
          :offline="offline"
          initial-source="saved"
        >
          <template #plot>
            <IsochroneForm
              ref="isochroneForm"
              :error="fetchError"
              :loading="isLoading"
              :offline="offline"
              :initial="linkedIsochrone"
              :framed="false"
              @submit="submitIsochrone"
              @origin-change="origin = $event"
              @pick-armed="pickArmed = $event"
            />
          </template>
          <template #saved>
            <PrerenderedIsochrones
              v-model:selected-id="selectedPrerenderedId"
              :slug="props.slug"
              @select="onPrerenderedSelect"
              @available="hasExamples = $event"
            />
          </template>
        </PlotPanel>
      </EmbedPlotCard>

      <template v-else>
        <!-- Kept mounted while hidden: the list has to load to say whether
             there is anything to offer. Clear of the credit and site link. -->
        <div
          v-show="showExamples"
          class="absolute inset-x-2.5 bottom-7 z-1 flex flex-col gap-1.5 rounded-(--radius-box) border border-border bg-white/92 p-2.5 shadow-(--shadow-panel)"
          data-testid="embed-examples"
        >
          <span class="t-eyebrow text-ink-muted">See what this network reaches</span>
          <PrerenderedIsochrones
            v-model:selected-id="selectedPrerenderedId"
            :slug="props.slug"
            layout="row"
            @select="onPrerenderedSelect"
            @available="hasExamples = $event"
          />
        </div>
        <p
          v-if="fetchError"
          class="t-error absolute inset-x-2.5 bottom-7 z-2 rounded-(--radius-field) bg-white/92 px-3 py-2 shadow-(--shadow-panel)"
          role="alert"
          data-testid="embed-plot-error"
        >
          {{ fetchError }}
        </p>
      </template>
    </template>
  </main>
</template>
