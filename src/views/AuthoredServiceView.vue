<script setup lang="ts">
import { fetchService } from '../api/authoring/services'
import type { Service } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'

const props = defineProps<{ slug: string }>()

const { item: service, loading, notFound, error } = useOwnedDetail<Service>(fetchService, props.slug)
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <router-link
      to="/authoring"
      class="font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
      data-testid="back-to-authoring"
    >
      ← My authoring
    </router-link>

    <p
      v-if="loading"
      class="font-body text-body mt-8 text-ink-muted"
    >
      Loading service…
    </p>

    <template v-else-if="notFound">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Service not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="service-not-found"
      >
        No service of yours matches "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="error">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Something went wrong
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        role="alert"
        data-testid="service-error"
      >
        Failed to load this service. Please try again.
      </p>
    </template>

    <template v-else-if="service">
      <hgroup class="mt-8 flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          {{ service.name }}
        </h1>
        <p class="font-body text-micro text-ink-muted uppercase">
          {{ service.slug }}
        </p>
      </hgroup>
      <p
        v-if="service.description"
        class="font-body text-body mt-3 max-w-[720px] text-ink"
      >
        {{ service.description }}
      </p>

      <div class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Stops
          </h2>
          <ol class="mt-3 flex flex-col gap-2">
            <li
              v-for="stop in service.stops"
              :key="stop.seq"
              class="font-body text-caption flex justify-between gap-3 text-ink"
              data-testid="service-stop-row"
            >
              <span>{{ stop.seq + 1 }}. {{ stop.name }}</span>
              <span class="text-ink-muted">{{ stop.lat.toFixed(4) }}, {{ stop.lng.toFixed(4) }}</span>
            </li>
          </ol>
        </section>

        <div class="flex flex-col gap-4">
          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Vehicle
            </h2>
            <dl class="font-body text-caption mt-3 flex flex-col gap-1 text-ink">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-muted">
                  Max speed
                </dt>
                <dd>{{ service.vehicle.max_speed_kmh }} km/h</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-muted">
                  Acceleration
                </dt>
                <dd>{{ service.vehicle.acceleration_ms2 }} m/s²</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-muted">
                  Deceleration
                </dt>
                <dd>{{ service.vehicle.deceleration_ms2 }} m/s²</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-muted">
                  Dwell
                </dt>
                <dd>{{ service.vehicle.dwell_s }} s</dd>
              </div>
            </dl>
          </section>

          <section class="rounded-(--radius-box) border border-border bg-surface p-4">
            <h2 class="font-display text-h3 text-ink-true">
              Frequency
            </h2>
            <ul class="mt-3 flex flex-col gap-1">
              <li
                v-for="(window, index) in service.frequency_windows"
                :key="index"
                class="font-body text-caption text-ink"
                data-testid="service-window-row"
              >
                {{ window.start_time }}–{{ window.end_time }}, every {{ Math.round(window.headway_s / 60) }} min
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>
