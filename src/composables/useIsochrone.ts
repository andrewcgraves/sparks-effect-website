import { ref } from 'vue'
import { fetchIsochrone, type IsochroneRequest } from '../api/isochrone'
import { isochroneFault, isochroneRangeRefusal, isochroneRequested } from '../api/isochroneFault'
import type { Station } from '../api/scenarios'
import type { ChainResponse } from '../fixtures/isochrone'

export function useIsochrone(getStations: () => Station[] = () => []) {
  const data = ref<ChainResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

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
    if (refusal) {
      data.value = null
      loading.value = false
      error.value = refusal
      return
    }

    loading.value = true
    error.value = null
    isochroneRequested(request.mode, request.budget_mins)
    try {
      data.value = await fetchIsochrone(request)
    } catch (e) {
      console.error(e)
      error.value = isochroneFault(e, request.mode, request.budget_mins)
    } finally {
      loading.value = false
    }
  }

  // A setter rather than the caller writing `data.value` because the refs
  // are only a single source of truth while one thing writes them: a shown
  // chain is also the answer now on screen, so a stale error from an earlier
  // failed generate has to go with it, and nothing outside here should have to
  // remember that.
  function show(result: ChainResponse): void {
    data.value = result
    error.value = null
    loading.value = false
  }

  return { data, loading, error, generate, show }
}
