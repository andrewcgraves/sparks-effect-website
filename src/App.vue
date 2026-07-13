<script setup lang="ts">
import { onMounted } from 'vue'
import { trackPageView } from './analytics/index'

onMounted(() => {
  trackPageView('/')
})
</script>

<template>
  <main>
    <h1>Sparks Effect</h1>
    <p>Isochrone map frontend — under construction.</p>
  </main>
</template>
