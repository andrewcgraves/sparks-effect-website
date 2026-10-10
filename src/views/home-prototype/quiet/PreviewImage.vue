<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. Stands in for the one image on the
// blog-style variants (H, I): a rendered preview of an active line with a
// splash zone on it. Nothing renders that image yet, so this is a plain panel
// at the final image's shape with the caption the real image would carry.
withDefaults(defineProps<{ caption?: string }>(), {
  caption: 'California High-Speed Rail: everywhere you could reach within 60 minutes of leaving downtown San Jose on foot.',
})
</script>

<template>
  <figure>
    <div
      class="flex aspect-[16/10] items-center justify-center rounded-(--radius-box) bg-surface p-6"
      role="img"
      aria-label="Placeholder for a rendered preview of California High-Speed Rail"
    >
      <p class="font-body text-caption max-w-[36ch] text-center text-ink-faint">
        Placeholder. The real image is a rendered preview of one active line with its splash zone on the map.
      </p>
    </div>
    <figcaption class="font-body text-caption mt-3 text-ink-muted">
      {{ caption }}
    </figcaption>
  </figure>
</template>
