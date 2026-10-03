<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useOwnedList } from '../composables/useOwnedList'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import { ACTION_LINK_CLASS, LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import AllLinesLink from '../components/AllLinesLink.vue'
import ListSkeleton from '../components/ListSkeleton.vue'

const auth = useAuthStore()
const router = useRouter()

const { items: services, loading: servicesLoading, error: servicesError } = useOwnedList(fetchMyServices)
const { items: scenarios, loading: scenariosLoading, error: scenariosError } = useOwnedList(fetchMyScenarios)

async function handleSignOut() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <AllLinesLink />
    <div class="mt-8 flex items-start justify-between gap-4">
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
        :class="ACTION_LINK_CLASS"
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
            :class="ACTION_LINK_CLASS"
            data-testid="new-service-link"
          >
            + New service
          </router-link>
        </div>
        <ListSkeleton
          v-if="servicesLoading"
          label="Loading your services"
          class="mt-3"
          data-testid="services-loading"
        />
        <p
          v-else-if="servicesError"
          class="font-body text-caption mt-3 text-error"
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
          >
            <router-link
              :to="`/authoring/services/${service.slug}`"
              :class="LIST_CARD_LINK_CLASS"
              data-testid="service-link"
            >
              {{ service.name }}
              <span class="text-micro text-ink-muted">{{ service.slug }}</span>
            </router-link>
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
            :class="ACTION_LINK_CLASS"
            data-testid="new-scenario-link"
          >
            + New scenario
          </router-link>
        </div>
        <ListSkeleton
          v-if="scenariosLoading"
          label="Loading your scenarios"
          class="mt-3"
          data-testid="scenarios-loading"
        />
        <p
          v-else-if="scenariosError"
          class="font-body text-caption mt-3 text-error"
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
          >
            <router-link
              :to="`/authoring/scenarios/${scenario.slug}`"
              :class="LIST_CARD_LINK_CLASS"
              data-testid="scenario-link"
            >
              {{ scenario.name }}
              <span class="text-micro text-ink-muted">{{ scenario.slug }}</span>
            </router-link>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
