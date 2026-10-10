<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant F, "Picture first": the splash
// drawing is the hero, full content width, with the headline and pitch set
// above it as plain text rather than floated over it. The steps run in one
// row beneath, then the line cards in a grid.
import { PITCH, type HomeData } from './homePrototypeData'
import { PRIMARY_BUTTON_CLASS } from '../../components/buttonStyles'
import { HEADLINE } from './quiet/headline'
import HeroFigure from './quiet/HeroFigure.vue'
import StepsList from './quiet/StepsList.vue'
import FeaturedLines from './quiet/FeaturedLines.vue'

defineProps<{ data: HomeData }>()
</script>

<template>
  <main class="flex flex-1 flex-col gap-16 p-(--page-padding)">
    <section>
      <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <h1 class="font-display text-display max-w-[18ch] text-ink-true">
          {{ HEADLINE }}
        </h1>
        <div class="max-w-[440px]">
          <p class="font-body text-body text-ink-muted">
            {{ PITCH }}
          </p>
          <router-link
            to="/scenario/ca-hsr"
            :class="[PRIMARY_BUTTON_CLASS, 'mt-5 inline-block']"
          >
            Explore a line
          </router-link>
        </div>
      </div>
      <HeroFigure
        :hero="data.hero"
        aspect="wide"
        class="mt-10"
      />
    </section>

    <section>
      <h2 class="font-display text-h2 text-ink-true">
        How it works
      </h2>
      <StepsList
        layout="row"
        class="mt-5"
      />
    </section>

    <FeaturedLines
      :data="data"
      layout="grid"
    />
  </main>
</template>
