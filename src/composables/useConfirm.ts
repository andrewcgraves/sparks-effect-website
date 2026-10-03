import { shallowRef } from 'vue'

export interface ConfirmOptions {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
  returnFocus: HTMLElement | null
}

// One dialog serves the whole site, so the ask lives at module scope: any
// caller can raise it and the host rendered once in App.vue shows it.
const pending = shallowRef<PendingConfirm | null>(null)

function settle(confirmed: boolean): void {
  const current = pending.value
  if (!current) return
  pending.value = null
  current.resolve(confirmed)
}

export function useConfirm() {
  function confirm(options: ConfirmOptions): Promise<boolean> {
    // A second ask while one is open replaces it, declining the first, but
    // focus still goes back to where the user was before either.
    const returnFocus = pending.value?.returnFocus
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    settle(false)
    return new Promise((resolve) => {
      pending.value = { ...options, resolve, returnFocus }
    })
  }

  return { confirm }
}

export function useConfirmHost() {
  return { pending, settle }
}
