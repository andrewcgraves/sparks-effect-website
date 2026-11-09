<script setup lang="ts">
// PROTOTYPE (SPA-462): a fake advocacy blog post that frames the embed route
// the way a reader would see it: one 640-wide column embed, one 320-wide
// sidebar embed, one with no params. ?variant= is passed through to every
// iframe. Throwaway. Styled deliberately unlike the site, so the embed's own
// chrome is judged against a foreign page.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import PrototypeSwitcher from '../../components/prototype/PrototypeSwitcher.vue'

const VARIANTS = [
  { key: 'static', name: 'Static, no controls' },
  { key: 'strip', name: 'Bottom control strip' },
  { key: 'panel', name: 'Side panel, real form' },
]

const route = useRoute()
const variant = computed(() => (typeof route.query.variant === 'string' ? route.query.variant : 'static'))

function src(query: Record<string, string>): string {
  const params = new URLSearchParams({ ...query, variant: variant.value, switcher: '0' })
  return `/embed/scenario/ca-hsr?${params.toString()}`
}

const plotted = computed(() => src({ at: '34.056,-118.236', mode: 'transit', mins: '120' }))
const empty = computed(() => src({}))
const sidebar = computed(() => src({ at: '35.389,-119.022', mode: 'walk', mins: '45' }))
</script>

<template>
  <div
    class="min-h-svh"
    style="background: #fbf7ef; color: #2b2520; font-family: Georgia, 'Times New Roman', serif;"
  >
    <div
      class="mx-auto flex max-w-[1040px] gap-10 px-6 py-10"
      style="flex-wrap: wrap;"
    >
      <article
        class="flex min-w-0 flex-col gap-5"
        style="flex: 1 1 560px; max-width: 640px;"
      >
        <p style="font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a7a68;">
          Central Valley Transit Riders · Blog
        </p>
        <h1 style="font-size: 38px; line-height: 1.1; margin: 0;">
          What two hours from Union Station looks like once high-speed rail opens
        </h1>
        <p style="font-size: 18px; line-height: 1.6;">
          People keep asking what the line would actually change for someone who lives here and doesn't
          own a car. Rather than describe it, here is the splash zone: everywhere you could reach within
          two hours by transit, starting at Los Angeles Union Station.
        </p>

        <iframe
          :src="plotted"
          width="100%"
          height="480"
          loading="lazy"
          style="border: 0; display: block;"
          title="California High-Speed Rail splash zone on Sparks Effect"
        />
        <p style="font-size: 13px; color: #8a7a68; margin-top: -8px;">
          640×480 · pre-populated from the URL (at, mode, mins), the snippet "Copy embed code" would produce.
        </p>

        <p style="font-size: 18px; line-height: 1.6;">
          Compare that with today, when the same two hours gets you roughly to the edge of town. The line
          turns Merced, Bakersfield and eventually San José into places you can go for an afternoon.
        </p>

        <iframe
          :src="empty"
          width="100%"
          height="480"
          loading="lazy"
          style="border: 0; display: block;"
          title="California High-Speed Rail map on Sparks Effect"
        />
        <p style="font-size: 13px; color: #8a7a68; margin-top: -8px;">
          640×480 · no params: the line and the prerendered examples, nothing plotted yet.
        </p>

        <p style="font-size: 18px; line-height: 1.6;">
          Try it from your own address on the full page, and send us what you find.
        </p>
      </article>

      <aside
        class="flex flex-col gap-4"
        style="flex: 0 0 320px;"
      >
        <div style="border-top: 3px solid #2b2520; padding-top: 10px;">
          <p style="font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #8a7a68; margin: 0 0 8px;">
            In the sidebar
          </p>
          <iframe
            :src="sidebar"
            width="320"
            height="300"
            loading="lazy"
            style="border: 0; display: block;"
            title="Bakersfield splash zone on Sparks Effect"
          />
          <p style="font-size: 13px; color: #8a7a68; margin-top: 6px;">
            320×300 · the minimum size the spec supports.
          </p>
        </div>
        <div style="border-top: 1px solid #d9cfc0; padding-top: 10px; font-size: 15px; line-height: 1.5;">
          <p style="margin: 0 0 6px;">
            <strong>Variants</strong>
          </p>
          <p style="margin: 0;">
            Use the bar at the bottom (or ← →) to switch every frame between
            <em>static</em>, <em>strip</em> and <em>panel</em>.
          </p>
        </div>
      </aside>
    </div>

    <PrototypeSwitcher :variants="VARIANTS" />
  </div>
</template>
