<script setup lang="ts">
import { computed } from 'vue'
import { fetchScenario } from '../api/authoring/scenarios'
import { fetchMyServices } from '../api/authoring/services'
import type { Scenario } from '../api/authoring/types'
import { useOwnedDetail } from '../composables/useOwnedDetail'
import { useOwnedList } from '../composables/useOwnedList'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

const props = defineProps<{ slug: string }>()

const { item: scenario, loading, notFound, error } = useOwnedDetail<Scenario>(fetchScenario, props.slug)

// A scenario stores bare service ids, so names come from the owner's own
// service list. It loads independently: a failure there degrades members to
// their ids rather than hiding the scenario.
const { items: services, loading: servicesLoading } = useOwnedList(fetchMyServices)

const members = computed(() => (scenario.value?.service_ids ?? []).map((id) => {
  const match = services.value.find((service) => service.id === id)
  return { id, name: match?.name ?? id, slug: match?.slug ?? null }
}))
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

      <section class="mt-8 max-w-[720px] rounded-(--radius-box) border border-border bg-surface p-4">
        <h2 class="font-display text-h3 text-ink-true">
          Services
        </h2>
        <!-- Held until the lookup settles so members don't flash their raw ids. -->
        <p
          v-if="servicesLoading"
          class="font-body text-caption mt-3 text-ink-muted italic"
        >
          Loading…
        </p>
        <p
          v-else-if="members.length === 0"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="scenario-members-empty"
        >
          This scenario has no services yet.
        </p>
        <ul
          v-else
          class="mt-3 flex flex-col gap-2"
        >
          <li
            v-for="member in members"
            :key="member.id"
            class="font-body text-caption text-ink"
            data-testid="scenario-member"
          >
            <router-link
              v-if="member.slug"
              :to="`/authoring/services/${member.slug}`"
              class="cursor-pointer transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
            >
              {{ member.name }}
              <span class="text-ink-muted">· {{ member.slug }}</span>
            </router-link>
            <span
              v-else
              class="text-ink-muted"
            >{{ member.id }}</span>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>
