<script setup lang="ts">
import { ACTION_LINK_CLASS } from '../components/linkStyles'
import PageHeader from '../components/PageHeader.vue'
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <PageHeader title="Page not found" />
    <p class="t-body mt-3 text-ink-muted">
      The page you're looking for doesn't exist.
    </p>
    <!-- Home is where the lines and networks are listed until an Explore page
         exists (SPA-202); then this gains a link there. -->
    <router-link
      to="/"
      :class="ACTION_LINK_CLASS"
      class="mt-8 inline-block"
      data-testid="not-found-home"
    >
      ← Home: browse the lines and networks
    </router-link>
  </main>
</template>
