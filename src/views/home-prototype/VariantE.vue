<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant E, "Lines first": the home page is
// the catalogue. A short headline and pitch, then the line cards straight
// away, because clicking a line is the one thing a visitor is here to do. The
// splash drawing and the steps explain what they will see, further down.
import { PITCH, type HomeData } from './homePrototypeData'
import { HEADLINE } from './quiet/headline'
import HeroFigure from './quiet/HeroFigure.vue'
import StepsList from './quiet/StepsList.vue'
import FeaturedLines from './quiet/FeaturedLines.vue'

defineProps<{ data: HomeData }>()
</script>

<template>
  <main class="flex flex-1 flex-col gap-16 p-(--page-padding)">
    <section class="max-w-[720px]">
      <h1 class="font-display text-display text-ink-true">
        {{ HEADLINE }}
      </h1>
      <p class="font-body text-lead mt-6 text-ink-muted">
        {{ PITCH }}
      </p>
    </section>

    <FeaturedLines
      :data="data"
      layout="grid"
      heading="Pick a line"
    />

    <section class="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-start">
      <HeroFigure
        :hero="data.hero"
        aspect="wide"
      />
      <div>
        <h2 class="font-display text-h2 text-ink-true">
          What you’ll see
        </h2>
        <StepsList class="mt-5" />
      </div>
    </section>
  </main>
</template>
