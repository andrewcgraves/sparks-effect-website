<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useToastHost } from '../composables/useToast'

const { toasts, dismiss, hold, release } = useToastHost()

const region = ref<HTMLElement | null>(null)

function onFocusOut(event: FocusEvent): void {
  if (region.value?.contains(event.relatedTarget as Node | null)) return
  release('focus')
}

// Removing the focused dismiss button sends focus to the body without a
// focusout in every browser, which would leave the clocks stopped for good.
async function dismissByHand(id: number): Promise<void> {
  dismiss(id)
  await nextTick()
  if (!region.value?.contains(document.activeElement)) release('focus')
}
</script>

<template>
  <div
    ref="region"
    class="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
    role="status"
    aria-live="polite"
    data-testid="toast-region"
    @mouseenter="hold('hover')"
    @mouseleave="release('hover')"
    @focusin="hold('focus')"
    @focusout="onFocusOut"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex max-w-[360px] items-start gap-3 rounded-(--radius-box) border bg-white px-4 py-3 shadow-(--shadow-panel)"
      :class="toast.kind === 'error' ? 'border-coral' : 'border-border'"
      :data-kind="toast.kind"
      data-testid="toast"
    >
      <p
        class="font-body text-caption flex-1"
        :class="toast.kind === 'error' ? 'text-coral' : 'text-ink'"
        data-testid="toast-message"
      >
        {{ toast.message }}
      </p>
      <button
        type="button"
        class="cursor-pointer px-1 text-ink-muted hover:text-ink"
        aria-label="Dismiss"
        data-testid="toast-dismiss"
        @click="dismissByHand(toast.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
