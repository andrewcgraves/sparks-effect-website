<script setup lang="ts">
import { useOwnedList } from '../composables/useOwnedList'
import { fetchFeaturedScenarios } from '../api/scenarios'
import { LIST_CARD_LINK_CLASS } from '../components/linkStyles'

const { items: scenarios, loading, error } = useOwnedList(fetchFeaturedScenarios)
</script>

<template>
  <main class="flex min-h-svh flex-col p-(--page-padding)">
    <div class="flex-1">
      <hgroup class="flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          Sparks Effect
        </h1>
        <p class="font-body text-micro text-ink-muted italic uppercase">
          Electrified · High-speed rail · Greenfield
        </p>
      </hgroup>

      <p class="font-body text-body mt-6 max-w-[560px] text-ink-muted">
        Sparks Effect maps the "splash zone" reachable by walking, biking, transit, and driving
        from a hypothetical transit route. This is a temporary landing page — pick a route below
        to explore its isochrones.
      </p>

      <section class="mt-12">
        <h2 class="font-display text-h2 text-ink-true">
          Published routes
        </h2>
        <p
          v-if="loading"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="scenarios-loading"
        >
          Loading…
        </p>
        <p
          v-else-if="error"
          class="font-body text-caption mt-3 text-coral"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load the published routes.
        </p>
        <p
          v-else-if="scenarios.length === 0"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="scenarios-empty"
        >
          No published routes yet.
        </p>
        <ul
          v-else
          class="mt-3 flex max-w-[420px] flex-col gap-2"
        >
          <li
            v-for="scenario in scenarios"
            :key="scenario.slug"
          >
            <router-link
              :to="`/scenario/${scenario.slug}`"
              :class="LIST_CARD_LINK_CLASS"
              data-testid="scenario-link"
            >
              {{ scenario.name }}
              <span class="text-micro text-ink-muted">{{ scenario.description }}</span>
            </router-link>
          </li>
        </ul>
      </section>
    </div>

    <footer class="font-body text-micro mt-16 text-ink-muted">
      Map data © <a
        class="underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >OpenStreetMap</a> contributors · Tiles via OpenFreeMap and Stadia Maps
    </footer>
  </main>
</template>
