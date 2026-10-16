<script setup lang="ts">
defineProps<{
  tone: 'caution' | 'error'
  size: 'banner' | 'inline'
}>()

const TONE_CLASS = {
  caution: 'border-apricot bg-apricot/15 text-ink',
  error: 'border-error bg-error/5 text-ink',
}

const SIZE_CLASS = {
  banner: 'rounded-(--radius-box) p-4',
  inline: 'rounded-(--radius-field) p-3',
}
</script>

<template>
  <p
    :class="['t-body border', TONE_CLASS[tone], SIZE_CLASS[size]]"
    :role="tone === 'error' ? 'alert' : 'status'"
  >
    <span
      v-if="tone === 'error'"
      class="t-error"
    ><slot /></span>
    <slot v-else />
  </p>
</template>
