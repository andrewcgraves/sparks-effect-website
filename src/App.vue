<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="flex flex-col min-h-svh bg-white">
    <header class="flex items-center py-4 px-[var(--page-gutter)] border-b border-border">
      <RouterLink
        class="font-display font-bold text-xl tracking-[-0.01em] text-ink-true no-underline hover:text-coral"
        to="/"
      >
        Sparks Effect
      </RouterLink>
    </header>
    <RouterView v-slot="{ Component, route }">
      <component
        :is="Component"
        :key="route.path"
      />
    </RouterView>
  </div>
</template>
