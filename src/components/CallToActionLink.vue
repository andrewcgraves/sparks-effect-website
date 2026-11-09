<script setup lang="ts">
import { computed } from 'vue'
import { PRIMARY_BUTTON_CLASS } from './buttonStyles'

const props = defineProps<{ label: string; url: string }>()

// The API only seeds https links, but this is the one place a scenario sends
// a visitor off the site, so anything else is dropped here too rather than
// trusted on the way through.
const href = computed(() => {
  try {
    const parsed = new URL(props.url)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
})
</script>

<template>
  <a
    v-if="href && label.trim()"
    :href="href"
    :class="[PRIMARY_BUTTON_CLASS, 'inline-block self-start']"
    target="_blank"
    rel="noopener noreferrer"
    data-testid="scenario-call-to-action"
  >{{ label }}</a>
</template>
