<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant G, "Side by side": the words stay
// put on the left (headline, pitch, button, steps) while the pictures scroll
// on the right: the splash drawing first, then the lines as rows. Collapses to
// one column on a phone.
import { PITCH, type HomeData } from './homePrototypeData'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import { HEADLINE } from './quiet/headline'
import HeroFigure from './quiet/HeroFigure.vue'
import StepsList from './quiet/StepsList.vue'
import FeaturedLines from './quiet/FeaturedLines.vue'

defineProps<{ data: HomeData }>()
</script>

<template>
  <main class="flex flex-1 flex-col p-(--page-padding)">
    <div class="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <section class="lg:sticky lg:top-24 lg:self-start">
        <h1 class="font-display text-display text-ink-true lg:text-[48px]">
          {{ HEADLINE }}
        </h1>
        <p class="font-body text-lead mt-6 text-ink-muted">
          {{ PITCH }}
        </p>
        <router-link
          to="/scenario/ca-hsr"
          :class="[PRIMARY_BUTTON_CLASS, 'mt-8 inline-block']"
        >
          Explore a line
        </router-link>
        <StepsList class="mt-12" />
      </section>

      <div class="flex flex-col gap-12">
        <HeroFigure
          :hero="data.hero"
          aspect="tall"
        />
        <FeaturedLines
          :data="data"
          layout="list"
        />
      </div>
    </div>
  </main>
</template>
