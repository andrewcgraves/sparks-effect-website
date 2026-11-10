<script setup lang="ts">
defineProps<{ href: string }>()
</script>

<template>
  <!-- No title, no caption: the page framing the embed already says what it
       is. The way back is this link, in the map's own credit line. Named for
       production on every host, as a reader of someone's post would know the
       site. -->
  <a
    :href="href"
    target="_blank"
    rel="noopener"
    class="inline-flex items-center gap-0.5 hover:text-ink hover:underline"
    data-testid="embed-site-link"
  >
    sparks-effect.app
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      class="size-2.5 fill-none stroke-current stroke-[2.5]"
    ><path d="M7 17 17 7M8 7h9v9" /></svg>
    <span class="sr-only">(opens in a new tab)</span>
  </a>
</template>
