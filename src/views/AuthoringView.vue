<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useOwnedList } from '../composables/useOwnedList'
import { fetchMyServices } from '../api/authoring/services'
import { fetchMyScenarios } from '../api/authoring/scenarios'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '../components/buttonStyles'
import { expiryDate, useHandovers } from '../composables/useHandovers'
import type { IncomingHandover } from '../api/authoring/handovers'
import { ACTION_LINK_CLASS, LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import AllLinesLink from '../components/AllLinesLink.vue'
import ListSkeleton from '../components/ListSkeleton.vue'
import Tag from '../components/Tag.vue'
import PageHeader from '../components/PageHeader.vue'

const auth = useAuthStore()

const {
  items: services,
  loading: servicesLoading,
  error: servicesError,
  reload: reloadServices,
} = useOwnedList(fetchMyServices)
const { items: scenarios, loading: scenariosLoading, error: scenariosError } = useOwnedList(fetchMyScenarios)

const handovers = useHandovers()
const { incoming, busy: handoverBusy, refusals } = handovers

const handoverPending = computed(() => new Set(handovers.outgoing.value.map((handover) => handover.service_slug)))

// The accepted line is the recipient's now, so their list is read again to
// show it rather than having a row made up for it here.
async function accept(handover: IncomingHandover): Promise<void> {
  if (await handovers.accept(handover)) await reloadServices()
}

const LINE_DEFINITION = 'A line is a set of stops along a route, with a vehicle and a timetable.'

// Only a pair of answered, empty reads means a new author: a list still
// loading or failed is not evidence there is nothing to show.
const hasLines = computed(() => !servicesLoading.value && !servicesError.value && services.value.length > 0)

const nothingYet = computed(() =>
  !servicesLoading.value && !scenariosLoading.value
  && !servicesError.value && !scenariosError.value
  && services.value.length === 0 && scenarios.value.length === 0,
)
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <AllLinesLink />
    <PageHeader
      class="mt-8"
      title="My authoring"
      :subtitle="`Signed in as ${auth.displayName ?? '…'}`"
    />

    <section
      v-if="incoming.length"
      class="mt-8 rounded-(--radius-box) border border-coral bg-surface p-4"
      aria-labelledby="incoming-handovers-heading"
      data-testid="incoming-handovers"
    >
      <h2
        id="incoming-handovers-heading"
        class="font-display text-h3 text-ink-true"
      >
        Incoming transfers
      </h2>
      <ul class="mt-3 flex flex-col gap-3">
        <li
          v-for="handover in incoming"
          :key="handover.id"
          class="flex flex-col gap-2"
          data-testid="incoming-handover"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="t-body flex flex-col text-ink">
              {{ handover.service_name }}
              <span class="t-meta text-ink-muted">
                From {{ handover.from_name }} · Expires {{ expiryDate(handover) }}
              </span>
            </p>
            <div class="flex gap-3">
              <button
                type="button"
                :class="SECONDARY_BUTTON_CLASS"
                :disabled="handoverBusy"
                data-testid="decline-handover"
                @click="handovers.decline(handover)"
              >
                Decline
              </button>
              <button
                type="button"
                :class="PRIMARY_BUTTON_CLASS"
                :disabled="handoverBusy"
                data-testid="accept-handover"
                @click="accept(handover)"
              >
                Accept
              </button>
            </div>
          </div>
          <p
            v-if="refusals[handover.id]"
            class="t-error"
            role="alert"
            data-testid="handover-refusal"
          >
            {{ refusals[handover.id] }}
          </p>
        </li>
      </ul>
    </section>

    <section
      v-if="nothingYet"
      class="mt-8 max-w-[560px] rounded-(--radius-box) border border-border bg-surface p-6"
      data-testid="authoring-empty"
    >
      <h2 class="font-display text-h2 text-ink-true">
        Start by drawing a line
      </h2>
      <p class="t-body mt-3 text-ink-muted">
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
          class="t-error mt-3"
          role="alert"
          data-testid="services-error"
        >
          Couldn't load your lines.
        </p>
        <p
          v-else-if="services.length === 0"
          class="t-note mt-3 text-ink-muted"
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
              <span class="t-meta text-ink-muted">{{ service.slug }}</span>
              <Tag
                v-if="handoverPending.has(service.slug)"
                tone="caution"
                class="self-start"
                data-testid="handover-pending"
              >Transfer pending</Tag>
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
          class="t-error mt-3"
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
            class="t-note text-ink-muted"
          >
            Combine your lines into a network so riders can change between them.
          </p>
          <p
            v-else
            class="t-note text-ink-muted"
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
              <span class="t-meta text-ink-muted">{{ scenario.slug }}</span>
            </router-link>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>
