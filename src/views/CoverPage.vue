<script setup lang="ts">
import { ref } from 'vue'
import { fetchCoverIndex, type CoverCard, type CoverSource } from '../api/coverIndex'
import { LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import ListSkeleton from '../components/ListSkeleton.vue'

const UNAVAILABLE_COPY: Record<CoverSource, string> = {
  scenario: "Couldn't load the curated networks.",
  service: "Couldn't load the published lines.",
}

const cards = ref<CoverCard[]>([])
const unavailable = ref<CoverSource[]>([])
const loading = ref(true)
const error = ref(false)

fetchCoverIndex()
  .then((index) => {
    cards.value = index.cards
    unavailable.value = index.unavailable
  })
  .catch(() => { error.value = true })
  .finally(() => { loading.value = false })
</script>

<template>
  <main class="flex flex-1 flex-col p-(--page-padding)">
    <div class="flex-1">
      <h1 class="font-display text-display text-ink-true">
        Sparks Effect
      </h1>

      <p class="font-body text-body mt-6 max-w-[560px] text-ink-muted">
        Sparks Effect maps the "splash zone" reachable by walking, biking, transit, and driving
        from a hypothetical transit line. This is a temporary landing page — pick a network or line below
        to explore its isochrones.
      </p>

      <section class="mt-12">
        <h2 class="font-display text-h2 text-ink-true">
          Published networks and lines
        </h2>
        <ListSkeleton
          v-if="loading"
          label="Loading published networks and lines"
          class="mt-3 max-w-[420px]"
          data-testid="scenarios-loading"
        />
        <p
          v-else-if="error"
          class="font-body text-caption mt-3 text-error"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load the published networks and lines.
        </p>
        <template v-else>
          <p
            v-for="source in unavailable"
            :key="source"
            class="font-body text-caption mt-3 text-error"
            role="alert"
            data-testid="scenarios-partial"
          >
            {{ UNAVAILABLE_COPY[source] }}
          </p>
          <!-- Empty only when both reads answered: with half missing, an
               empty list is not evidence that nothing is published. -->
          <p
            v-if="cards.length === 0 && unavailable.length === 0"
            class="font-body text-caption mt-3 text-ink-muted italic"
            data-testid="scenarios-empty"
          >
            No published networks or lines yet.
          </p>
          <ul
            v-if="cards.length > 0"
            class="mt-3 flex max-w-[420px] flex-col gap-2"
          >
            <li
              v-for="card in cards"
              :key="`${card.kind}:${card.slug}`"
            >
              <router-link
                :to="card.to"
                :class="LIST_CARD_LINK_CLASS"
                :data-testid="`${card.kind}-link`"
              >
                {{ card.name }}
                <span
                  v-if="card.caption"
                  class="text-micro text-ink-muted"
                >{{ card.caption }}</span>
              </router-link>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </main>
</template>
