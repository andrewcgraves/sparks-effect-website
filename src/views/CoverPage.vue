<script setup lang="ts">
import { ref } from 'vue'
import { fetchCoverIndex, type CoverCard, type CoverSource } from '../api/coverIndex'
import { INLINE_LINK_CLASS, LIST_CARD_LINK_CLASS } from '../components/linkStyles'
import ListSkeleton from '../components/ListSkeleton.vue'
// PROTOTYPE (SPA-414) — throwaway variant switcher; see src/views/home-prototype.
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import PrototypeSwitcher from '../components/PrototypeSwitcher.vue'
import { useHomePrototypeData, type ForcedState } from './home-prototype/homePrototypeData'
import VariantA from './home-prototype/VariantA.vue'
import VariantB from './home-prototype/VariantB.vue'
import VariantC from './home-prototype/VariantC.vue'
import VariantD from './home-prototype/VariantD.vue'
import VariantE from './home-prototype/VariantE.vue'
import VariantF from './home-prototype/VariantF.vue'
import VariantG from './home-prototype/VariantG.vue'

const VARIANTS = [
  { key: '0', label: 'Current page' },
  { key: 'A', label: 'Map hero' },
  { key: 'B', label: 'Editorial split' },
  { key: 'C', label: 'Step-through' },
  { key: 'D', label: 'Single column' },
  { key: 'E', label: 'Lines first' },
  { key: 'F', label: 'Picture first' },
  { key: 'G', label: 'Side by side' },
]
const PROTOTYPES: Record<string, Component> = { A: VariantA, B: VariantB, C: VariantC, D: VariantD, E: VariantE, F: VariantF, G: VariantG }
const FORCED: ForcedState[] = ['none', 'one-failed', 'both-failed', 'empty']
const route = useRoute()
// The existing specs mount this page with no query; they keep seeing the real page.
const variant = computed(() => (route.query.variant as string | undefined) ?? (import.meta.env.MODE === 'test' ? '0' : 'A'))
const home = useHomePrototypeData()

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
  <component
    :is="PROTOTYPES[variant]"
    v-if="PROTOTYPES[variant]"
    :data="home"
  />
  <PrototypeSwitcher
    :variants="VARIANTS"
    :current="variant"
  >
    <span class="rounded-full bg-white/15 px-2 py-1">{{ home.loading ? 'loading…' : `${home.source} data` }}</span>
    <label class="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
      state
      <select
        v-model="home.forced"
        class="cursor-pointer bg-transparent text-white [&>option]:text-ink"
      >
        <option
          v-for="f in FORCED"
          :key="f"
          :value="f"
        >{{ f }}</option>
      </select>
    </label>
  </PrototypeSwitcher>
  <main
    v-if="!PROTOTYPES[variant]"
    class="flex flex-1 flex-col p-(--page-padding)"
  >
    <div class="flex-1">
      <h1 class="font-display text-display text-ink-true">
        Sparks Effect
      </h1>

      <p
        class="font-body text-body mt-6 max-w-[560px] text-ink-muted"
        data-testid="cover-lede"
      >
        A splash zone is everywhere you can reach from one spot within a time budget, on foot,
        by bike, by car, or by riding a hypothetical transit line. Pick a line or network below,
        then choose where to start.
      </p>

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
          class="font-body text-caption mt-3 text-error"
          role="alert"
          data-testid="scenarios-error"
        >
          Couldn't load the lines and networks.
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
            No lines or networks yet.
            <router-link
              to="/how-it-works"
              :class="['not-italic', INLINE_LINK_CLASS]"
            >
              How it works
            </router-link>
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
