<script setup lang="ts">
import { useToast } from '../composables/useToast'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'

const { show: toast } = useToast()

function copyBySelection(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  try {
    field.select()
    // Deprecated, but it is the only copy left where the Clipboard API is
    // missing (outside a secure context) or refused.
    return document.execCommand?.('copy') ?? false
  } catch {
    return false
  } finally {
    field.remove()
  }
}

async function copyLink(): Promise<void> {
  const url = window.location.href
  let copied: boolean
  try {
    // navigator.clipboard is missing outside a secure context; reading
    // writeText off it throws here, and lands in the same fallback.
    await navigator.clipboard.writeText(url)
    copied = true
  } catch {
    copied = copyBySelection(url)
  }
  if (copied) toast('Link copied')
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
