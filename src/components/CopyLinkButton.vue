<script setup lang="ts">
import { useToast } from '../composables/useToast'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { copyText } from './clipboard'

const { show: toast } = useToast()

async function copyLink(): Promise<void> {
  if (await copyText(window.location.href)) toast('Link copied')
  else toast("Couldn't copy the link. Copy it from the address bar.", { kind: 'error' })
}
</script>

<template>
  <button
    type="button"
    :class="[SECONDARY_BUTTON_CLASS, 'self-start']"
    data-testid="copy-link"
    @click="copyLink"
  >
    Copy link
  </button>
</template>
