import { ref } from 'vue'
import { fetchIsochrone, IsochroneApiError, type IsochroneRequest } from '../api/isochrone'
import { trackIsochroneRequest, trackIsochroneError } from '../analytics/index'
import type { ChainResponse } from '../fixtures/isochrone'

/**
 * Owns the isochrone request lifecycle. Unlike `useScenario`, it fires on user
 * action rather than on mount, so it takes the fully-assembled request from the
 * caller and exposes an explicit `generate`. `generate` mutates refs only — the
 * refs are the single source of truth — and never rejects.
 */
export function useIsochrone() {
  const data = ref<ChainResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function generate(request: IsochroneRequest): Promise<void> {
    loading.value = true
    error.value = null
    trackIsochroneRequest(request.mode, request.budget_mins)
    try {
      data.value = await fetchIsochrone(request)
    } catch (e) {
      console.error(e)
      const status = e instanceof IsochroneApiError ? e.status : null
      trackIsochroneError(request.mode, request.budget_mins, status)
      error.value = 'Failed to generate isochrone. Please try again.'
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, generate }
}
