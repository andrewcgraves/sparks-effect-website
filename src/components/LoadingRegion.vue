<script setup lang="ts">
const props = withDefaults(defineProps<{ label?: string }>(), { label: 'Loading' })
</script>

<template>
  <div aria-busy="true">
    <span
      class="sr-only"
      role="status"
    >{{ props.label }}</span>
    <slot />
  </div>
</template>
