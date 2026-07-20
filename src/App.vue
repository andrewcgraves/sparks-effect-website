<script setup lang="ts">
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="min-h-svh">
    <header class="flex justify-end gap-4 p-(--page-padding) pb-0">
      <RouterLink
        v-if="auth.isAuthenticated"
        to="/authoring"
        class="font-display text-btn text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        data-testid="nav-authoring"
      >
        My authoring
      </RouterLink>
      <RouterLink
        v-else
        to="/login"
        class="font-display text-btn text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral"
        data-testid="nav-login"
      >
        Sign in
      </RouterLink>
    </header>
    <RouterView />
  </div>
</template>
