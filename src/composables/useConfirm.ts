import { ref, shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

export interface ConfirmWithNoteOptions extends ConfirmOptions {
  noteLabel: string
}

export interface ConfirmWithEmailOptions extends ConfirmOptions {
  emailLabel: string
}

interface PendingConfirm extends ConfirmOptions {
  noteLabel?: string
  emailLabel?: string
  resolve: (confirmed: boolean) => void
  returnFocus: HTMLElement | null
}

// One dialog serves the whole site, so the ask lives at module scope: any
// caller can raise it and the host rendered once in App.vue shows it.
const pending = shallowRef<PendingConfirm | null>(null)
const note = ref('')

function settle(confirmed: boolean): void {
  const current = pending.value
  if (!current) return
  pending.value = null
  current.resolve(confirmed)
}

export function useConfirm() {
  function confirm(options: ConfirmOptions | ConfirmWithNoteOptions | ConfirmWithEmailOptions): Promise<boolean> {
    // A second ask while one is open replaces it, declining the first, but
    // focus still goes back to where the user was before either.
    const returnFocus = pending.value?.returnFocus
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    settle(false)
    note.value = ''
    return new Promise((resolve) => {
      pending.value = { ...options, resolve, returnFocus }
    })
  }

  // The note comes back trimmed, and may be empty.
  async function confirmWithNote(options: ConfirmWithNoteOptions): Promise<string | null> {
    return (await confirm(options)) ? note.value.trim() : null
  }

  // The address shares the note's slot: a dialog asks for one or the other.
  async function confirmWithEmail(options: ConfirmWithEmailOptions): Promise<string | null> {
    return (await confirm(options)) ? note.value.trim() : null
  }

  return { confirm, confirmWithNote, confirmWithEmail }
}

export function useConfirmHost() {
  return { pending, note, settle }
}
