<script setup lang="ts">
import { ref, watch } from 'vue'
import { useToastHost } from '../composables/useToast'

const { toasts, dismiss, hold, release } = useToastHost()

const stack = ref<HTMLElement | null>(null)

function onFocusOut(event: FocusEvent): void {
  if (stack.value?.contains(event.relatedTarget as Node | null)) return
  release('focus')
}

// Removing a focused dismiss button, by hand or by a newer toast pushing its
// toast out, sends focus to the body without a focusout in every browser,
// which would leave the clocks stopped for good.
watch(toasts, () => {
  if (!stack.value?.contains(document.activeElement)) release('focus')
}, { flush: 'post' })
</script>

<template>
  <!-- Announcements live apart from the visible stack so a screen reader hears
       the message alone, not the dismiss control beside it. -->
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
    data-testid="toast-region"
  >
    <p
      v-for="toast in toasts"
      :key="toast.id"
    >
      {{ toast.message }}
    </p>
  </div>
  <div
    ref="stack"
    class="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto"
    data-testid="toast-stack"
    @mouseenter="hold('hover')"
    @mouseleave="release('hover')"
    @focusin="hold('focus')"
    @focusout="onFocusOut"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="pointer-events-auto flex max-w-[360px] items-start gap-3 rounded-(--radius-box) border bg-surface px-4 py-3 shadow-(--shadow-panel)"
      :class="toast.kind === 'error' ? 'border-coral text-coral' : 'border-border text-ink'"
      :data-kind="toast.kind"
      data-testid="toast"
    >
      <p
        class="font-body text-caption flex-1"
        aria-hidden="true"
        data-testid="toast-message"
      >
        {{ toast.message }}
      </p>
      <button
        type="button"
        class="cursor-pointer px-1 text-ink-muted hover:text-ink"
        :aria-label="`Dismiss: ${toast.message}`"
        data-testid="toast-dismiss"
        @click="dismiss(toast.id)"
      >
        ✕
      </button>
    </div>
  </div>
</template>
