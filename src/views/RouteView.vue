<script setup lang="ts">
import { computed } from 'vue'
import MapView from '../components/MapView.vue'
import { useRouteDetail } from '../composables/useRouteDetail'
import type { Route as ScenarioRoute } from '../api/scenarios'

const props = defineProps<{ slug: string }>()

const { route, loading, notFound, error } = useRouteDetail(props.slug)

const mapRoutes = computed<ScenarioRoute[]>(() => {
  if (!route.value) return []
  return [{
    id: route.value.id,
    scenario_id: route.value.scenario_id ?? '',
    name: route.value.name,
    mode: route.value.mode,
    geometry: route.value.geometry,
    bidirectional: route.value.bidirectional,
  }]
})
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <p
      v-if="loading"
      class="font-body text-body text-ink-muted"
    >
      Loading route…
    </p>

    <template v-else-if="notFound">
      <h1 class="font-display text-display text-ink-true">
        Route not found
      </h1>
      <p class="font-body text-body mt-3 text-ink-muted">
        No route matches "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="error">
      <h1 class="font-display text-display text-ink-true">
        Something went wrong
      </h1>
      <p class="font-body text-body mt-3 text-ink-muted">
        Failed to load this route. Please try again.
      </p>
    </template>

    <template v-else-if="route">
      <h1 class="font-display text-display text-ink-true">
        {{ route.name }}
      </h1>

      <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
          <MapView
            :loading="false"
            :isochrone-data="null"
            :routes="mapRoutes"
            :stations="[]"
            :services="[]"
            hide-isochrone-legend
          />
        </div>

        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Segment physics
          </h2>
          <table class="font-body text-caption mt-3 w-full text-ink">
            <thead>
              <tr class="text-ink-muted">
                <th class="text-left font-normal">
                  Segment
                </th>
                <th class="text-left font-normal">
                  Cant
                </th>
                <th class="text-left font-normal">
                  Curve radius
                </th>
                <th class="text-left font-normal">
                  Grade
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(segment, index) in route.segments"
                :key="index"
                data-testid="route-segment-row"
              >
                <td>{{ index + 1 }}</td>
                <td>{{ segment.cant_mm }} mm</td>
                <td>{{ segment.curve_radius_m > 0 ? `${segment.curve_radius_m} m` : 'Tangent' }}</td>
                <td>{{ segment.grade_pct }}%</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>
  </main>
</template>
