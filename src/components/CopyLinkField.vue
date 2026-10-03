<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '../composables/useToast'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { FIELD_INPUT_CLASS } from './fieldStyles'

const props = defineProps<{ url: string; label: string }>()

const { show: toast } = useToast()
const field = ref<HTMLInputElement | null>(null)
const copyFailed = ref(false)

async function copy(): Promise<void> {
  copyFailed.value = false
  try {
    // navigator.clipboard is missing outside a secure context; reading
    // writeText off it throws here, and lands in the same fallback.
    await navigator.clipboard.writeText(props.url)
    toast('Link copied')
  } catch {
    copyFailed.value = true
    field.value?.select()
  }
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex gap-2">
      <input
        ref="field"
        :value="url"
        :aria-label="label"
        readonly
        :class="[FIELD_INPUT_CLASS, 'min-w-0 flex-1']"
        @focus="field?.select()"
      >
      <button
        type="button"
        :class="SECONDARY_BUTTON_CLASS"
        data-testid="copy-link"
        @click="copy"
      >
        Copy
      </button>
    </div>
    <p
      v-if="copyFailed"
      class="font-body text-micro text-ink-muted"
      data-testid="copy-link-failed"
    >
      Couldn't copy. The link is selected; copy it by hand.
    </p>
  </div>
</template>
