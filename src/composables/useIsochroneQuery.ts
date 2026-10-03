import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DEFAULT_DURATION, DEFAULT_MODE, readSplashQuery, splashQuery, type SplashZone } from '../splashQuery'
import { latestAttempt } from './latestAttempt'

const SPLASH_KEYS = new Set(['at', 'mode', 'mins'])

export interface IsochroneQueryOptions {
  plot: (zone: SplashZone) => Promise<void>
  plotted: () => boolean
  ready?: () => boolean
}

export function useIsochroneQuery({ plot, plotted, ready = () => true }: IsochroneQueryOptions) {
  const route = useRoute()
  const router = useRouter()

  const initial = readSplashQuery(route.query)
  const plots = latestAttempt()

  async function submit(zone: SplashZone): Promise<void> {
    const attempt = plots.begin()
    await plot(zone)
    // Only an answer now on screen goes in the URL: a failed plot would share
    // a question with no answer, and a superseded one an answer since replaced.
    if (!plots.isCurrent(attempt) || !plotted()) return
    // replace, not push: re-plotting is refining one question, and Back
    // should leave the page rather than step through every attempt.
    await router.replace({ query: { ...route.query, ...splashQuery(zone) } })
  }

  // An origin is the whole question; a link that drops the mode or budget is
  // still worth answering, with the form's own defaults for them.
  if (initial.lat !== undefined && initial.lng !== undefined) {
    const linked: SplashZone = {
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

  // For a page that can replace a plotted splash zone with something else —
  // the URL must stop naming what is no longer on screen.
  async function forget(): Promise<void> {
    plots.supersede()
    const rest = Object.entries(route.query).filter(([key]) => !SPLASH_KEYS.has(key))
    await router.replace({ query: Object.fromEntries(rest) })
  }

  const shareable = computed(() => readSplashQuery(route.query).lat !== undefined)

  return { initial, submit, forget, shareable }
}
