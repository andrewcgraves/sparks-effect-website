import { computed, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import {
  DEFAULT_DURATION,
  DEFAULT_MODE,
  readIsochroneQuery,
  writeIsochroneQuery,
  type IsochronePayload,
} from '../isochroneQuery'
import { latestAttempt } from './latestAttempt'

const QUERY_KEYS = new Set(['at', 'mode', 'mins'])

export interface IsochroneQueryOptions {
  plot: (payload: IsochronePayload) => Promise<void>
  plotted: () => boolean
  ready?: () => boolean
}

function withoutIsochrone(query: LocationQuery): LocationQuery {
  return Object.fromEntries(Object.entries(query).filter(([key]) => !QUERY_KEYS.has(key)))
}

export function useIsochroneQuery({ plot, plotted, ready = () => true }: IsochroneQueryOptions) {
  const route = useRoute()
  const router = useRouter()

  const initial = readIsochroneQuery(route.query)
  const attempts = latestAttempt()

  async function submit(payload: IsochronePayload): Promise<void> {
    const attempt = attempts.begin()
    await plot(payload)
    if (!attempts.isCurrent(attempt)) return
    // Only an answer now on screen stays in the URL: a failed plot — a shared
    // link's included — would otherwise leave "Copy link" offering a question
    // whose answer is an error, or an earlier answer no longer drawn.
    // replace, not push: re-plotting is refining one question, and Back
    // should leave the page rather than step through every attempt.
    const query = plotted()
      ? { ...route.query, ...writeIsochroneQuery(payload) }
      : withoutIsochrone(route.query)
    await router.replace({ query })
  }

  async function forget(): Promise<void> {
    // The page has replaced the plotted isochrone with something else, so the
    // URL must stop naming it, and a plot still in flight must not restore it.
    attempts.supersede()
    await router.replace({ query: withoutIsochrone(route.query) })
  }

  // An origin is the whole question; a link that drops the mode or budget is
  // still worth answering, with the form's own defaults for them.
  if (initial.lat !== undefined && initial.lng !== undefined) {
    const linked: IsochronePayload = {
      lat: initial.lat,
      lng: initial.lng,
      mode: initial.mode ?? DEFAULT_MODE,
      duration: initial.duration ?? DEFAULT_DURATION,
    }
    let pending = true
    watch(ready, (isReady) => {
      if (!pending || !isReady) return
      pending = false
      void submit(linked)
    }, { immediate: true })
  }

  const shareable = computed(() => readIsochroneQuery(route.query).lat !== undefined)

  return { initial, submit, forget, shareable }
}
