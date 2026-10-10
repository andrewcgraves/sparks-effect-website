<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant I, "Cover": the same post as H but
// the image comes first, wide, like a cover image, and the words sit under
// it in the reading column.
import { PITCH, type HomeData } from './homePrototypeData'
import { INLINE_LINK_CLASS } from '../../components/linkStyles'
import { HEADLINE } from './quiet/headline'
import PreviewImage from './quiet/PreviewImage.vue'
import LineList from './quiet/LineList.vue'

defineProps<{ data: HomeData }>()
</script>

<template>
  <main class="flex flex-1 flex-col p-(--page-padding)">
    <article class="mx-auto w-full max-w-[960px]">
      <PreviewImage />

      <div class="mx-auto mt-12 max-w-[640px]">
        <h1 class="font-display text-[clamp(32px,4vw,44px)] leading-[1.1] font-bold tracking-tight text-ink-true">
          {{ HEADLINE }}
        </h1>
        <p class="font-body text-lead mt-6 text-ink-muted">
          {{ PITCH }}
        </p>
        <p class="font-body text-body mt-6 text-ink">
          Try it: open
          <router-link
            to="/scenario/ca-hsr"
            :class="INLINE_LINK_CLASS"
          >
            California High-Speed Rail
          </router-link>
          and pick a starting point to see your own splash zone.
        </p>

        <section class="mt-14">
          <h2 class="font-display text-h2 text-ink-true">
            Lines
          </h2>
          <LineList
            :data="data"
            class="mt-4"
          />
          <p class="font-body text-caption mt-4 text-ink-muted">
            <router-link
              to="/how-it-works"
              :class="INLINE_LINK_CLASS"
            >
              How it works
            </router-link>
          </p>
        </section>
      </div>
    </article>
  </main>
</template>
