<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useOwnedList } from '../composables/useOwnedList'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'

const auth = useAuthStore()
const router = useRouter()

// Independent failures: one list failing to load shouldn't hide the other.
const { items: services, loading: servicesLoading, error: servicesError } = useOwnedList(fetchMyServices)
const { items: scenarios, loading: scenariosLoading, error: scenariosError } = useOwnedList(fetchMyScenarios)

async function handleSignOut() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <div class="flex items-start justify-between gap-4">
      <hgroup class="flex flex-col gap-2">
        <h1 class="font-display text-display text-ink-true">
          My authoring
        </h1>
        <p class="font-body text-micro text-ink-muted italic uppercase">
          Signed in as {{ auth.user?.email ?? '…' }}
        </p>
      </hgroup>
      <button
        type="button"
        class="font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        data-testid="sign-out"
        @click="handleSignOut"
      >
        Sign out
      </button>
    </div>

    <div class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-display text-h2 text-ink-true">
            My services
          </h2>
          <router-link
            to="/authoring/services/new"
            class="font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
            data-testid="new-service-link"
          >
            + New service
          </router-link>
        </div>
        <p
          v-if="servicesLoading"
          class="font-body text-caption mt-3 text-ink-muted italic"
        >
          Loading…
        </p>
        <p
          v-else-if="servicesError"
          class="font-body text-caption mt-3 text-coral"
          role="alert"
          data-testid="services-error"
        >
          Couldn't load your services.
        </p>
        <p
          v-else-if="services.length === 0"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="services-empty"
        >
          You haven't created any services yet.
        </p>
        <ul
          v-else
          class="mt-3 flex flex-col gap-2"
        >
          <li
            v-for="service in services"
            :key="service.id"
            class="font-body text-body rounded-(--radius-field) border border-border bg-surface px-3 py-2 text-ink"
          >
            {{ service.name }}
          </li>
        </ul>
      </section>

      <section>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-display text-h2 text-ink-true">
            My scenarios
          </h2>
          <router-link
            to="/authoring/scenarios/new"
            class="font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
            data-testid="new-scenario-link"
          >
            + New scenario
          </router-link>
        </div>
        <p
          v-if="scenariosLoading"
          class="font-body text-caption mt-3 text-ink-muted italic"
        >
          Loading…
        </p>
        <p
          v-else-if="scenariosError"
          class="font-body text-caption mt-3 text-coral"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load your scenarios.
        </p>
        <p
          v-else-if="scenarios.length === 0"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="scenarios-empty"
        >
          You haven't created any scenarios yet.
        </p>
        <ul
          v-else
          class="mt-3 flex flex-col gap-2"
        >
          <li
            v-for="scenario in scenarios"
            :key="scenario.id"
            class="font-body text-body rounded-(--radius-field) border border-border bg-surface px-3 py-2 text-ink"
          >
            {{ scenario.name }}
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
