<script setup lang="ts">
import { AUTHORING_NOUN_WORDS, type AuthoringNoun } from '../api/authoringFault'
import { DESTRUCTIVE_BUTTON_CLASS } from './buttonStyles'
import { ACTION_LINK_CLASS } from './linkStyles'

defineProps<{ noun: AuthoringNoun, deleting: boolean }>()

defineEmits<{ delete: [] }>()
</script>

<template>
  <details
    class="relative"
    :data-testid="`${noun}-actions`"
  >
    <summary :class="[ACTION_LINK_CLASS, 'list-none']">
      More
    </summary>
    <div class="absolute right-0 z-10 mt-2 rounded-(--radius-box) border border-border bg-surface p-2 shadow-sm">
      <button
        type="button"
        :class="[DESTRUCTIVE_BUTTON_CLASS, 'whitespace-nowrap']"
        :data-testid="`delete-${noun}`"
        :disabled="deleting"
        @click="$emit('delete')"
      >
        {{ deleting ? 'Deleting…' : `Delete ${AUTHORING_NOUN_WORDS[noun]}` }}
      </button>
    </div>
  </details>
</template>
