<script setup lang="ts">
import { ref } from 'vue'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { useScenario } from '../composables/useScenario'
import { useIsochrone } from '../composables/useIsochrone'

const props = defineProps<{ slug: string }>()

const origin = ref<{ lat: number; lng: number } | null>(null)

const { name, description, routes, stations, services } = useScenario(props.slug)
const { data: isochroneData, loading: isLoading, error: fetchError, generate } = useIsochrone()

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

async function handleFormSubmit(payload: { lat: number; lng: number; duration: number; mode: 'walk' | 'bike' | 'drive' }) {
  origin.value = { lat: payload.lat, lng: payload.lng }
  await generate({
    lat: payload.lat,
    lng: payload.lng,
    budget_mins: payload.duration,
    mode: payload.mode,
    scenario_slug: props.slug,
  })
}
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <hgroup class="flex max-w-[720px] flex-col gap-2">
      <h1 class="font-display text-display text-ink-true">
        Route: {{ name || 'Sparks Effect' }}
      </h1>
      <!-- Static copy: the scenario API exposes no field for this kicker yet. -->
      <p class="font-body text-micro text-ink-muted italic uppercase">
        Electrified · High-speed rail · Greenfield
      </p>
    </hgroup>

    <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
      <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
        <MapView
          :origin="origin"
          :isochrone-data="isochroneData"
          :loading="isLoading"
          :routes="routes"
          :stations="stations"
          :services="services"
        />
      </div>

      <div class="flex flex-col gap-4">
        <IsochroneForm
          :error="fetchError"
          :loading="isLoading"
          @submit="handleFormSubmit"
          @origin-change="onOriginChange"
        />
        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Speed graph
          </h2>
          <p class="font-body text-caption mt-2 text-ink-muted italic">
            Placeholder — no data source yet.
          </p>
        </section>
      </div>
    </div>

    <section class="mt-16 max-w-[720px]">
      <h2 class="font-display text-h2 text-ink-true">
        Description
      </h2>
      <p class="font-body text-body mt-3 text-ink-muted">
        {{ description || '—' }}
      </p>
    </section>

    <section class="mt-12 max-w-[720px]">
      <h2 class="font-display text-h2 text-ink-true">
        Technology assumptions
      </h2>
      <!-- Awaiting a `technology_assumptions` field on the scenario API. -->
      <p class="font-body text-caption mt-3 text-ink-muted italic">
        Placeholder — awaiting a field on the scenario API.
      </p>
    </section>
  </main>
</template>
