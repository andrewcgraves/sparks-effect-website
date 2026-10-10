<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant D, "Single column": everything in
// one left-aligned column of reading width, top to bottom like an article.
// Headline, pitch, button; the splash drawing; the steps; the lines as rows.
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
    <div class="flex w-full max-w-[720px] flex-col gap-16">
      <section>
        <h1 class="font-display text-display text-ink-true">
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
      </section>

      <HeroFigure
        :hero="data.hero"
        aspect="wide"
      />

      <section>
        <h2 class="font-display text-h2 text-ink-true">
          How it works
        </h2>
        <StepsList class="mt-5" />
      </section>

      <FeaturedLines
        :data="data"
        layout="list"
      />
    </div>
  </main>
</template>
