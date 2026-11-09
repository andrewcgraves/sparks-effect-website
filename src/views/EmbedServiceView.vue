<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { PLOT_WITHOUT_MAP } from '../components/mapLoad'
import PlotPanel from '../components/PlotPanel.vue'
import EmbedPlotCard from '../components/embed/EmbedPlotCard.vue'
import EmbedSiteLink from '../components/embed/EmbedSiteLink.vue'
import EmbedUnavailable from '../components/embed/EmbedUnavailable.vue'
import { ORIGIN_PICK_CUE } from '../components/placementCues'
import { fetchPublicationIsochrone, fetchServicePublication } from '../api/publications'
import { isochroneWaitMessage } from '../api/isochroneFault'
import { trackEmbedLoad } from '../analytics/index'
import { useAuthoredGraph } from '../composables/useAuthoredGraph'
import { useIsochroneQuery } from '../composables/useIsochroneQuery'
import { useOriginPick } from '../composables/useOriginPick'
import { useRoutingStatus } from '../composables/useRoutingStatus'
import { fullPageHref } from '../embed/embedLinks'

const props = defineProps<{ slug: string }>()

const route = useRoute()
// Fixed for the life of the frame: it is the embedder's choice, made once in
// the snippet they pasted.
const controls = route.query.controls === '1'

trackEmbedLoad(document.referrer)

const { offline } = useRoutingStatus()
const { pickArmed, onMapClick } = useOriginPick()

// A pinned target, as on the full page: nothing here can compile, and the
// publication and its graph are the one read.
const {
  loadedGraph: publication,
  graphFailed,
  graphNotFound,
  loadGraph,
  origin,
  isochroneData,
  isochroneError,
  isochroneProgress,
  isochroneFormLoading,
  mapStations,
  mapRoutes,
  onOriginChange,
  handleIsochroneSubmit,
} = useAuthoredGraph(() => props.slug, {
  fetchGraph: fetchServicePublication,
  isochrone: fetchPublicationIsochrone,
}, { offline: () => offline.value })

const unavailable = computed(() => graphNotFound.value || graphFailed.value)

const { initial: linkedIsochrone, submit: submitIsochrone } = useIsochroneQuery({
  plot: handleIsochroneSubmit,
  plotted: () => isochroneData.value !== null && isochroneError.value === null,
  ready: () => publication.value !== null,
})

const siteHref = computed(() => fullPageHref(window.location.origin, { kind: 'services', slug: props.slug }, route.query))

void loadGraph(props.slug)
</script>

<template>
  <main
    class="@container relative h-svh overflow-hidden bg-white text-ink"
    data-testid="embed-root"
  >
    <EmbedUnavailable v-if="unavailable" />
    <template v-else>
      <MapView
        label="Splash zone map"
        :without-map="PLOT_WITHOUT_MAP"
        flush
        hide-isochrone-legend
        :origin="origin"
        :isochrone-data="isochroneData"
        :loading="isochroneFormLoading"
        :loading-message="isochroneWaitMessage(isochroneProgress)"
        :routes="mapRoutes"
        :stations="mapStations"
        :placement-armed="pickArmed"
        :placement-cue="ORIGIN_PICK_CUE"
        @map-click="onMapClick"
      />
      <EmbedSiteLink :href="siteHref" />

      <EmbedPlotCard
        v-if="controls"
        :plot="isochroneData"
        :error="isochroneError"
        :pick-armed="pickArmed"
        :start-open="linkedIsochrone.lat === undefined"
      >
        <PlotPanel
          :has-saved="false"
          :offline="offline"
        >
          <template #plot>
            <IsochroneForm
              ref="isochroneForm"
              :error="isochroneError"
              :loading="isochroneFormLoading"
              :offline="offline"
              :initial="linkedIsochrone"
              :framed="false"
              @submit="submitIsochrone"
              @origin-change="onOriginChange"
              @pick-armed="pickArmed = $event"
            />
          </template>
        </PlotPanel>
      </EmbedPlotCard>

      <p
        v-else-if="isochroneError"
        class="t-error absolute inset-x-2.5 bottom-7 z-2 rounded-(--radius-field) bg-white/92 px-3 py-2 shadow-(--shadow-panel)"
        role="alert"
        data-testid="embed-plot-error"
      >
        {{ isochroneError }}
      </p>
    </template>
  </main>
</template>
