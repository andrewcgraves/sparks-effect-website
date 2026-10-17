<script setup lang="ts">
defineProps<{ tone: 'neutral' | 'caution' | 'error' }>()

const TONE_CLASS = {
  neutral: 'border-border',
  caution: 'border-apricot bg-apricot/15 text-ink',
  error: 'border-error text-error',
}
</script>

<template>
  <span :class="['t-tag rounded-(--radius-field) border px-1.5', TONE_CLASS[tone]]"><slot /></span>
</template>
