<script setup lang="ts">
import { ACTION_LINK_CLASS } from '../components/linkStyles'
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <h1 class="font-display text-display text-ink-true">
      Page not found
    </h1>
    <p class="font-body text-body mt-3 text-ink-muted">
      The page you're looking for doesn't exist.
    </p>
    <!-- Home is where the published networks and lines are listed until an Explore page
         exists (SPA-202); then this gains a link there. -->
    <router-link
      to="/"
      :class="ACTION_LINK_CLASS"
      class="mt-8 inline-block"
      data-testid="not-found-home"
    >
      ← Home: browse the published networks and lines
    </router-link>
  </main>
</template>
