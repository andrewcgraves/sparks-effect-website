<script setup lang="ts">
defineProps<{ stops: string[] }>()
</script>

<template>
  <section class="rounded-(--radius-box) border border-border bg-surface p-4">
    <h2 class="font-display text-h3 text-ink-true">
      Stops
    </h2>
    <ol class="mt-3 flex flex-col gap-2">
      <li
        v-for="(name, index) in stops"
        :key="index"
        class="font-body text-caption text-ink"
        data-testid="service-stop-row"
      >
        {{ index + 1 }}. {{ name }}
      </li>
    </ol>
  </section>
</template>
