import { computed, onScopeDispose, readonly, ref } from 'vue'
import { fetchRoutingStatus, type RoutingStatus } from '../api/routingStatus'

export const ROUTING_STATUS_POLL_MS = 60_000
export const ROUTING_STATUS_TIMEOUT_MS = 10_000

// One poll serves the whole tab, so its state lives at module scope: every
// plotting component on the page reads the same answer from the same request.
const status = ref<RoutingStatus>('ok')
let subscribers = 0
let timer: ReturnType<typeof setInterval> | undefined
let generation = 0
let inFlight: number | null = null

function fetchWithDeadline(): Promise<RoutingStatus> {
  const controller = new AbortController()
  let deadline: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => {
      controller.abort()
      reject(new Error('routing status timed out'))
    }, ROUTING_STATUS_TIMEOUT_MS)
  })
  return Promise.race([fetchRoutingStatus({ signal: controller.signal }), expired])
    .finally(() => clearTimeout(deadline))
}

async function poll(): Promise<void> {
  // A focus landing while the minute's request is still out would only ask the
  // same question twice. Keyed by generation, so a request from pages that have
  // since gone does not hold up the next page's first question.
  const mine = generation
  if (inFlight === mine) return
  inFlight = mine
  let next: RoutingStatus
  try {
    next = await fetchWithDeadline()
  } catch {
    // Not knowing — a failure, or an answer too slow to wait for — is not a
    // reason to warn anyone: the page behaves as it did before there was a
    // status to ask for.
    next = 'ok'
  } finally {
    if (inFlight === mine) inFlight = null
  }
  if (mine === generation) status.value = next
}

function onFocus(): void {
  void poll()
}

function start(): void {
  void poll()
  timer = setInterval(() => void poll(), ROUTING_STATUS_POLL_MS)
  window.addEventListener('focus', onFocus)
}

function stop(): void {
  clearInterval(timer)
  timer = undefined
  window.removeEventListener('focus', onFocus)
  // An answer still in flight belongs to pages that have gone, and the next
  // page to open asks afresh rather than inheriting an old warning.
  generation++
  status.value = 'ok'
}

export function useRoutingStatus() {
  if (subscribers++ === 0) start()
  onScopeDispose(() => {
    if (--subscribers === 0) stop()
  })
  return { status: readonly(status), offline: computed(() => status.value === 'offline') }
}
