<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useOwnedList } from '../composables/useOwnedList'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import { PRIMARY_BUTTON_CLASS } from '../components/buttonStyles'
import { ACTION_LINK_CLASS, LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import AllLinesLink from '../components/AllLinesLink.vue'
import ListSkeleton from '../components/ListSkeleton.vue'

const auth = useAuthStore()
const router = useRouter()

const { items: services, loading: servicesLoading, error: servicesError } = useOwnedList(fetchMyServices)
const { items: scenarios, loading: scenariosLoading, error: scenariosError } = useOwnedList(fetchMyScenarios)

const LINE_DEFINITION = 'A line is a set of stops along a route, with a vehicle and a timetable.'

// Only a pair of answered, empty reads means a new author: a list still
// loading or failed is not evidence there is nothing to show.
const hasLines = computed(() => !servicesLoading.value && !servicesError.value && services.value.length > 0)

const nothingYet = computed(() =>
  !servicesLoading.value && !scenariosLoading.value
  && !servicesError.value && !scenariosError.value
  && services.value.length === 0 && scenarios.value.length === 0,
)

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
          Signed in as {{ auth.displayName ?? '…' }}
        </p>
      </hgroup>
      <!-- Until the header account menu (M4) exists, the account page is reached from here. -->
      <div class="flex gap-4">
        <router-link
          to="/account"
          :class="ACTION_LINK_CLASS"
          data-testid="account-link"
        >
          Account
        </router-link>
        <button
          type="button"
          :class="ACTION_LINK_CLASS"
          data-testid="sign-out"
          @click="handleSignOut"
        >
          Sign out
        </button>
      </div>
    </div>

    <section
      v-if="nothingYet"
      class="mt-8 max-w-[560px] rounded-(--radius-box) border border-border bg-surface p-6"
      data-testid="authoring-empty"
    >
      <h2 class="font-display text-h2 text-ink-true">
        Start by drawing a line
      </h2>
      <p class="font-body text-body mt-3 text-ink-muted">
        {{ LINE_DEFINITION }}
        A network combines lines so riders can change between them.
      </p>
      <router-link
        to="/authoring/services/new"
        :class="[PRIMARY_BUTTON_CLASS, 'mt-6 inline-block']"
        data-testid="first-service-link"
      >
        Create your first line
      </router-link>
    </section>

    <div
      v-else
      class="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2"
    >
      <section>
        <div class="flex items-center justify-between gap-3">
          <h2 class="font-display text-h2 text-ink-true">
            My lines
          </h2>
          <router-link
            to="/authoring/services/new"
            :class="ACTION_LINK_CLASS"
            data-testid="new-service-link"
          >
            + New line
          </router-link>
        </div>
        <ListSkeleton
          v-if="servicesLoading"
          label="Loading your lines"
          class="mt-3"
          data-testid="services-loading"
        />
        <p
          v-else-if="servicesError"
          class="font-body text-caption mt-3 text-error"
          role="alert"
          data-testid="services-error"
        >
          Couldn't load your lines.
        </p>
        <p
          v-else-if="services.length === 0"
          class="font-body text-caption mt-3 text-ink-muted italic"
          data-testid="services-empty"
        >
          {{ LINE_DEFINITION }} You haven't created one yet.
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
            My networks
          </h2>
          <router-link
            to="/authoring/scenarios/new"
            :class="ACTION_LINK_CLASS"
            data-testid="new-scenario-link"
          >
            + New network
          </router-link>
        </div>
        <ListSkeleton
          v-if="scenariosLoading"
          label="Loading your networks"
          class="mt-3"
          data-testid="scenarios-loading"
        />
        <p
          v-else-if="scenariosError"
          class="font-body text-caption mt-3 text-error"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load your networks.
        </p>
        <div
          v-else-if="scenarios.length === 0"
          class="mt-3 flex flex-col items-start gap-4"
          data-testid="scenarios-empty"
        >
          <p
            v-if="hasLines"
            class="font-body text-caption text-ink-muted italic"
          >
            Combine your lines into a network so riders can change between them.
          </p>
          <p
            v-else
            class="font-body text-caption text-ink-muted italic"
          >
            A network combines lines so riders can change between them.
          </p>
          <router-link
            v-if="hasLines"
            to="/authoring/scenarios/new"
            :class="PRIMARY_BUTTON_CLASS"
            data-testid="first-scenario-link"
          >
            Create a network
          </router-link>
        </div>
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
