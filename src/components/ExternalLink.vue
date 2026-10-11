<script setup lang="ts">
import { PROSE_LINK_CLASS } from './proseStyles'

defineProps<{ href: string }>()
</script>

<template>
  <a
    :href="href"
    :class="PROSE_LINK_CLASS"
    target="_blank"
    rel="noopener noreferrer"
  ><slot /></a>
</template>
