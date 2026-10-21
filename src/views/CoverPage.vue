<script setup lang="ts">
import { ref } from 'vue'
import { fetchCoverIndex, type CoverCard, type CoverSource } from '../api/coverIndex'
import { ACTION_LINK_CLASS, LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import ListSkeleton from '../components/ListSkeleton.vue'
import PageHeader from '../components/PageHeader.vue'
import { PROSE_LEAD_CLASS } from '../components/proseStyles'

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
      <PageHeader title="Sparks Effect" />

      <p
        :class="PROSE_LEAD_CLASS"
        class="max-w-[560px]"
        data-testid="cover-lede"
      >
        A splash zone is everywhere you can reach from one spot within a set travel time, on foot,
        by bike, by car, or by riding a hypothetical transit line. Pick a line or network below,
        then choose where to start.
      </p>
      <router-link
        to="/how-it-works"
        :class="ACTION_LINK_CLASS"
        class="mt-4 inline-block"
        data-testid="cover-how-it-works"
      >
        How it works →
      </router-link>

      <section class="mt-12">
        <h2 class="font-display text-h2 text-ink-true">
          Lines and networks
        </h2>
        <ListSkeleton
          v-if="loading"
          label="Loading lines and networks"
          class="mt-3 max-w-[420px]"
          data-testid="scenarios-loading"
        />
        <p
          v-else-if="error"
          class="t-error mt-3"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load the lines and networks.
        </p>
        <template v-else>
          <p
            v-for="source in unavailable"
            :key="source"
            class="t-error mt-3"
            role="alert"
            data-testid="scenarios-partial"
          >
            {{ UNAVAILABLE_COPY[source] }}
          </p>
          <!-- Empty only when both reads answered: with half missing, an
               empty list is not evidence that nothing is published. -->
          <p
            v-if="cards.length === 0 && unavailable.length === 0"
            class="t-note mt-3 text-ink-muted"
            data-testid="scenarios-empty"
          >
            No lines or networks yet.
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
                  class="t-meta text-ink-muted"
                >{{ card.caption }}</span>
              </router-link>
            </li>
          </ul>
        </template>
      </section>
    </div>
  </main>
</template>
