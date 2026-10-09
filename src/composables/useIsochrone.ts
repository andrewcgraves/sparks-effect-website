import { ref } from 'vue'
import { fetchIsochrone, type IsochroneRequest } from '../api/isochrone'
import type { IsochroneProgress } from '../api/routingJobs'
import { isochroneFault, isochroneRangeRefusal, isochroneRequested } from '../api/isochroneFault'
import type { Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'
import { latestAttempt } from './latestAttempt'
import { useAnnouncer } from './useToast'
import { PLOTTING_SPLASH_ZONE, splashZoneReadyMessage } from './progressAnnouncements'

export function useIsochrone(getStations: () => Station[] = () => []) {
  const data = ref<ChainResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const progress = ref<IsochroneProgress | null>(null)
  // A late answer to a question already re-asked — or already answered by
  // show() — writes nothing; requests cannot be recalled, only ignored.
  const attempts = latestAttempt()
  const { announce } = useAnnouncer()

  async function generate(request: IsochroneRequest): Promise<void> {
    // Before the request, not after: an origin with no station near it is a
    // question the page can already answer, and answering it here costs no
    // round trip and spends none of the worker's time. The API runs the same
    // check and is the one that binds — see originRange.
    const refusal = isochroneRangeRefusal(
      getStations(),
      { lat: request.lat, lng: request.lng },
      request.mode,
      request.budget_mins,
    )
    const attempt = attempts.begin()
    if (refusal) {
      data.value = null
      loading.value = false
      error.value = refusal
      return
    }

    loading.value = true
    error.value = null
    progress.value = null
    announce(PLOTTING_SPLASH_ZONE)
    isochroneRequested(request.mode, request.budget_mins)
    try {
      const result = await fetchIsochrone(request, (latest) => {
        if (attempts.isCurrent(attempt)) progress.value = latest
      })
      if (attempts.isCurrent(attempt)) {
        data.value = result
        announce(splashZoneReadyMessage(result))
      }
    } catch (e) {
      console.error(e)
      if (attempts.isCurrent(attempt)) error.value = isochroneFault(e, request.mode, request.budget_mins)
    } finally {
      if (attempts.isCurrent(attempt)) {
        loading.value = false
        progress.value = null
      }
    }
  }

  // A setter rather than the caller writing `data.value` because the refs
  // are only a single source of truth while one thing writes them: a shown
  // chain is also the answer now on screen, so a stale error from an earlier
  // failed generate has to go with it, and nothing outside here should have to
  // remember that.
  function show(result: ChainResponse): void {
    attempts.supersede()
    data.value = result
    error.value = null
    loading.value = false
    announce(splashZoneReadyMessage(result))
  }

  return { data, loading, error, progress, generate, show }
}
