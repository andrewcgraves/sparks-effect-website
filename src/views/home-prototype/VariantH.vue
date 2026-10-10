<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Variant H, "Post": the home page as a
// short blog post in one centred column. Headline, one paragraph, one image,
// a line inviting the visitor to try it, and the lines as a plain list.
import { PITCH, type HomeData } from './homePrototypeData'
import { INLINE_LINK_CLASS } from '../../components/linkStyles'
import { HEADLINE } from './quiet/headline'
import PreviewImage from './quiet/PreviewImage.vue'
import LineList from './quiet/LineList.vue'

defineProps<{ data: HomeData }>()
</script>

<template>
  <main class="flex flex-1 flex-col p-(--page-padding)">
    <article class="mx-auto w-full max-w-[640px]">
      <h1 class="font-display text-[clamp(32px,4vw,44px)] leading-[1.1] font-bold tracking-tight text-ink-true">
        {{ HEADLINE }}
      </h1>
      <p class="font-body text-lead mt-6 text-ink-muted">
        {{ PITCH }}
      </p>

      <PreviewImage class="mt-10" />

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
    </article>
  </main>
</template>
