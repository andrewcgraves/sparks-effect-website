<script setup lang="ts">
import { onMounted } from 'vue'
import { trackPageView } from './analytics/index'
import IsochroneForm from './IsochroneForm.vue'
import MapView from './components/MapView.vue'

onMounted(() => {
  trackPageView('/')
})
</script>

<template>
  <main class="app-shell">
    <h1>Sparks Effect</h1>
    <IsochroneForm />
    <div class="map-shell">
      <MapView />
    </div>
  </main>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
  margin: 0;
}

.app-shell h1 {
  margin: 0.75rem 1rem;
}

.map-shell {
  flex: 1;
  min-height: 70vh;
}
</style>
