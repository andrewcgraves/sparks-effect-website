<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfirmHost } from '../composables/useConfirm'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'
import { DESTRUCTIVE_BUTTON_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'

const { pending, note, settle } = useConfirmHost()

const dialog = ref<HTMLDialogElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)
const noteField = ref<HTMLTextAreaElement | null>(null)

watch(pending, (now, before) => {
  const el = dialog.value
  if (!el) return
  if (now) {
    if (!el.open) el.showModal()
    // Whatever is asked must be chosen deliberately, so Enter on open lands on
    // the safe choice, or in the note, where Enter only starts a new line.
    ;(noteField.value ?? cancelButton.value)?.focus()
    return
  }
  if (el.open) el.close()
  before?.returnFocus?.focus()
}, { flush: 'post' })

// A modal <dialog> makes the page inert in browsers, but Tab can still leave
// for the browser's own chrome; this keeps it cycling through the dialog.
function trapTab(event: KeyboardEvent): void {
  const buttons = [...(dialog.value?.querySelectorAll<HTMLElement>('textarea, button:not([disabled])') ?? [])]
  if (buttons.length === 0) return
  const first = buttons[0]
  const last = buttons[buttons.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

// Escape is handled here rather than left to the dialog's native cancel so the
// answer and the close happen together, in every browser and in tests.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    settle(false)
  } else if (event.key === 'Tab') {
    trapTab(event)
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(440px,calc(100vw-32px))] rounded-(--radius-box) border border-border bg-surface p-5 text-ink shadow-(--shadow-panel) backdrop:bg-ink/40"
    aria-labelledby="confirm-dialog-title"
    aria-describedby="confirm-dialog-body"
    data-testid="confirm-dialog"
    @keydown="onKeydown"
    @cancel.prevent="settle(false)"
    @close="settle(false)"
  >
    <template v-if="pending">
      <h2
        id="confirm-dialog-title"
        class="font-display text-h3 text-ink-true"
      >
        {{ pending.title }}
      </h2>
      <p
        id="confirm-dialog-body"
        class="font-body text-caption mt-3 text-ink"
      >
        {{ pending.body }}
      </p>
      <label
        v-if="pending.noteLabel"
        :class="['mt-4', FIELD_LABEL_CLASS]"
      >
        {{ pending.noteLabel }}
        <textarea
          ref="noteField"
          v-model="note"
          rows="3"
          :class="FIELD_INPUT_CLASS"
          data-testid="confirm-dialog-note"
        />
      </label>
      <div class="mt-5 flex flex-wrap justify-end gap-3">
        <button
          ref="cancelButton"
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          data-testid="confirm-dialog-cancel"
          @click="settle(false)"
        >
          {{ pending.cancelLabel ?? 'Cancel' }}
        </button>
        <button
          type="button"
          :class="pending.destructive ? DESTRUCTIVE_BUTTON_CLASS : PRIMARY_BUTTON_CLASS"
          data-testid="confirm-dialog-confirm"
          @click="settle(true)"
        >
          {{ pending.confirmLabel }}
        </button>
      </div>
    </template>
  </dialog>
</template>
