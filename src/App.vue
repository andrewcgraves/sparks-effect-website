<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink
        class="app-header__brand"
        to="/"
      >
        Sparks Effect
      </RouterLink>
    </header>
    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
  margin: 0;
  background: #ffffff;
}

.app-header {
  display: flex;
  align-items: center;
  padding: 1rem var(--page-gutter);
  border-bottom: 1px solid var(--color-border);
}

.app-header__brand {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: -0.01em;
  color: var(--color-ink-true);
  text-decoration: none;
}

.app-header__brand:hover {
  color: var(--color-coral);
}
</style>
