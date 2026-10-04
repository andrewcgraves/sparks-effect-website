<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ACTION_LINK_CLASS } from './linkStyles'

const router = useRouter()

// Explore (SPA-202) is where every line is listed; until it lands, the cover
// page is the nearest thing to it.
const destination = computed(() => (router.hasRoute('explore') ? { name: 'explore' } : '/'))
</script>

<template>
  <RouterLink
    :to="destination"
    :class="ACTION_LINK_CLASS"
    data-testid="back-to-lines"
  >
    ← All lines
  </RouterLink>
</template>
