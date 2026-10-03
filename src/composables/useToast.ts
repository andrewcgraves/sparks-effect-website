import { ref } from 'vue'

export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

export const TOAST_DURATION_MS = 4000
const MAX_TOASTS = 3

interface Countdown {
  remainingMs: number
  startedAt: number
  timer?: ReturnType<typeof setTimeout>
}

// One region serves the whole site, so the queue lives at module scope: any
// caller can raise a toast and the host rendered once in App.vue shows it.
const toasts = ref<Toast[]>([])
const countdowns = new Map<number, Countdown>()
const holds = new Set<'hover' | 'focus'>()
let nextId = 1

function dismiss(id: number): void {
  clearTimeout(countdowns.get(id)?.timer)
  countdowns.delete(id)
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

function run(id: number, countdown: Countdown): void {
  countdown.startedAt = Date.now()
  countdown.timer = setTimeout(() => dismiss(id), countdown.remainingMs)
}

// Hovering or focusing the region stops every toast's clock, so a message
// being read or reached for doesn't vanish; each picks up where it left off.
function hold(reason: 'hover' | 'focus'): void {
  if (holds.size === 0) {
    for (const countdown of countdowns.values()) {
      clearTimeout(countdown.timer)
      countdown.remainingMs -= Date.now() - countdown.startedAt
    }
  }
  holds.add(reason)
}

function release(reason: 'hover' | 'focus'): void {
  if (!holds.delete(reason) || holds.size > 0) return
  for (const [id, countdown] of countdowns) run(id, countdown)
}

function clear(): void {
  for (const { id } of toasts.value) dismiss(id)
  holds.clear()
}

export function useToast() {
  function show(message: string, { kind = 'success' }: { kind?: ToastKind } = {}): void {
    const id = nextId++
    toasts.value = [...toasts.value, { id, message, kind }]
    while (toasts.value.length > MAX_TOASTS) dismiss(toasts.value[0].id)
    const countdown: Countdown = { remainingMs: TOAST_DURATION_MS, startedAt: Date.now() }
    countdowns.set(id, countdown)
    if (holds.size === 0) run(id, countdown)
  }

  return { show }
}

export function useToastHost() {
  return { toasts, dismiss, hold, release, clear }
}
