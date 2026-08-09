import { ref } from 'vue'
import { fetchIsochrone, IsochroneApiError, type IsochroneRequest } from '../api/isochrone'
import { JobFailedError } from '../api/polling'
import { trackIsochroneRequest, trackIsochroneError } from '../analytics/index'
import { checkOriginReach, outOfRangeError, outOfRangeMessage } from '../originRange'
import type { Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'

/**
 * Owns the isochrone request lifecycle. Unlike `useScenario`, it fires on user
 * action rather than on mount, so it takes the fully-assembled request from the
 * caller and exposes an explicit `generate`. `generate` mutates refs only — the
 * refs are the single source of truth — and never rejects.
 *
 * `getStations` is how the origin-range check (SPA-200) sees where the stations
 * are. It is a getter rather than a value because the caller resolves them from
 * a request of its own that may not have answered yet; an empty list means the
 * check is skipped and the API decides, which is what a page that has not
 * loaded its scenario should do.
 */
export function useIsochrone(getStations: () => Station[] = () => []) {
  const data = ref<ChainResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function generate(request: IsochroneRequest): Promise<void> {
    // Before the request, not after: an origin with no station near it is a
    // question the page can already answer, and answering it here costs no
    // round trip and spends none of the worker's time. The API runs the same
    // check and is the one that binds — see originRange.
    const reach = checkOriginReach(
      getStations(),
      { lat: request.lat, lng: request.lng },
      request.mode,
      request.budget_mins,
    )
    if (reach && !reach.inRange) {
      data.value = null
      loading.value = false
      trackIsochroneError(request.mode, request.budget_mins, null)
      error.value = outOfRangeMessage(reach, request.mode, request.budget_mins)
      return
    }

    loading.value = true
    error.value = null
    trackIsochroneRequest(request.mode, request.budget_mins)
    try {
      data.value = await fetchIsochrone(request)
    } catch (e) {
      console.error(e)
      const status = e instanceof IsochroneApiError ? e.status : null
      trackIsochroneError(request.mode, request.budget_mins, status)
      // The API refusing the origin as out of range is a case the local check
      // above could not see: a station list that has gone stale, or one whose
      // stations differ from the compiled graph's nodes. Its own distances are
      // the accurate ones, so its message wins over the generic failure.
      //
      // A routing job that reached `failed` — the isochrone service being down
      // chief among the reasons (SPA-230) — carries its own reason from the
      // API too, and that wins the same way for the same reason: it says
      // something a generic "try again" cannot, like whether trying again is
      // even worth it right now.
      error.value =
        outOfRangeError(e instanceof IsochroneApiError ? e.cause : e, request.mode, request.budget_mins) ??
        (e instanceof JobFailedError ? e.jobError || null : null) ??
        'Failed to generate isochrone. Please try again.'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, generate }
}
