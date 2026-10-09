<script setup lang="ts">
// PROTOTYPE (SPA-414) — throwaway. The failure and empty copy every variant
// shares, so the forced states read the same across them.
import { UNAVAILABLE_COPY } from './homePrototypeData'

defineProps<{ failed: boolean; unavailable: string[]; empty: boolean }>()
</script>

<template>
  <p
    v-if="failed"
    role="alert"
    class="font-body text-caption text-error"
  >
    Couldn’t load the featured lines right now. The example above still works —
    <router-link
      to="/scenario/ca-hsr"
      class="underline hover:text-coral"
    >
      open California High-Speed Rail
    </router-link>.
  </p>
  <template v-else>
    <p
      v-for="source in unavailable"
      :key="source"
      role="alert"
      class="font-body text-caption text-error"
    >
      {{ UNAVAILABLE_COPY[source] }}
    </p>
    <p
      v-if="empty && unavailable.length === 0"
      class="font-body text-caption text-ink-muted italic"
    >
      No lines are published yet.
    </p>
  </template>
</template>
