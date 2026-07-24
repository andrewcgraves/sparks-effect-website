<script setup lang="ts">
import { fetchScenario } from '../api/authoring/scenarios'
import type { Scenario } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

const props = defineProps<{ slug: string }>()

const { item: scenario, loading, notFound, error } = useOwnedDetail<Scenario>(fetchScenario, props.slug)
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <router-link
      to="/authoring"
      :class="ACTION_LINK_CLASS"
      data-testid="back-to-authoring"
    >
      ← My authoring
    </router-link>

    <p
      v-if="loading"
      class="font-body text-body mt-8 text-ink-muted"
    >
      Loading scenario…
    </p>

    <template v-else-if="notFound">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Scenario not found
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        data-testid="scenario-not-found"
      >
        No scenario of yours matches "{{ props.slug }}".
      </p>
    </template>

    <template v-else-if="error">
      <h1 class="font-display text-display mt-8 text-ink-true">
        Something went wrong
      </h1>
      <p
        class="font-body text-body mt-3 text-ink-muted"
        role="alert"
        data-testid="scenario-error"
      >
        Failed to load this scenario. Please try again.
      </p>
    </template>

    <template v-else-if="scenario">
      <hgroup class="mt-8 flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          {{ scenario.name }}
        </h1>
        <p class="font-body text-micro text-ink-muted uppercase">
          {{ scenario.slug }}
        </p>
      </hgroup>
      <p
        v-if="scenario.description"
        class="font-body text-body mt-3 max-w-[720px] text-ink"
      >
        {{ scenario.description }}
      </p>

      <!-- The map and isochrone form live on the public scenario page, so this
           page points at it rather than restating the scenario's contents. -->
      <router-link
        :to="`/scenario/${scenario.slug}`"
        class="font-display text-btn mt-8 inline-block cursor-pointer rounded-(--radius-field) border border-border bg-surface px-4 py-2 text-ink uppercase transition-colors duration-200 ease-(--ease-smooth) hover:border-coral hover:text-coral"
        data-testid="view-isochrones-link"
      >
        View isochrones →
      </router-link>
    </template>
  </main>
</template>
