<script setup lang="ts">
defineProps<{ href: string }>()
</script>

<template>
  <!-- No title, no caption: the page framing the embed already says what it
       is. The way back is this small link at the bottom left, mirroring the
       map credit at the bottom right. Named for production on every host, as
       a reader of someone's post would know the site. -->
  <a
    :href="href"
    target="_blank"
    rel="noopener"
    class="absolute bottom-0 left-0 z-1 flex items-center gap-1 rounded-tr-(--radius-field) bg-white/80 px-1.5 text-[12px] leading-5 text-ink-muted hover:text-ink hover:underline"
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
