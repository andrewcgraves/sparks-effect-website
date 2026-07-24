import { computed, ref } from 'vue'
import { compileScenario, fetchScenarioIsochrone } from '../api/authoring/scenarios'
import { ApiError } from '../api/authoring/client'
import type { TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'
import { useCompileJob } from './useCompileJob'

// A stale-graph retry should settle in one or two hops in practice; this just
// bounds it so a persistently stale signal can't spin the UI forever.
const MAX_STALE_GRAPH_RETRIES = 3

export interface IsochronePayload {
  lat: number
  lng: number
  duration: number
  mode: 'walk' | 'bike' | 'drive'
}

/**
 * The isochrone half of a user scenario: plotting against its compiled graph,
 * and the compile lifecycle that keeps that graph current. Shared by the
 * builder (which plots the scenario it just saved) and the preview page (which
 * plots one loaded by slug), so the stale-graph dance has one implementation.
 *
 * The slug arrives as a getter because both callers resolve it late — the
 * builder only after a save, the preview page from its route props.
 */
export function useScenarioIsochrone(getSlug: () => string | null) {
  const { compiling, compileError, result: compiledGraph, trigger: triggerCompile, reset: resetCompile }
    = useCompileJob(compileScenario)

  // A page that opens an already-compiled scenario reads its graph rather than
  // recompiling; a fresh compile supersedes it.
  const loadedGraph = ref<TransitGraph | null>(null)
  const graph = computed(() => compiledGraph.value ?? loadedGraph.value)

  const origin = ref<{ lat: number; lng: number } | null>(null)
  const isochroneData = ref<ChainResponse | null>(null)
  const isochroneLoading = ref(false)
  const isochroneError = ref<string | null>(null)

  const merge = computed(() => graph.value?.merge)
  const nearMisses = computed(() => merge.value?.near_misses ?? [])
  const realisedClusters = computed(() => merge.value?.clusters ?? [])

  // The compile is part of the same wait from the user's point of view.
  const isochroneFormLoading = computed(() => isochroneLoading.value || compiling.value)

  function setGraph(value: TransitGraph | null): void {
    loadedGraph.value = value
  }

  function onOriginChange(coords: { lat: number; lng: number } | null): void {
    origin.value = coords
  }

  // A member service edited elsewhere answers 409 (stale_graph) on the
  // isochrone call itself, not just on compile — recompile and retry rather
  // than making the user work out why their scenario stopped plotting.
  async function generateIsochrone(payload: IsochronePayload, attempt = 1): Promise<void> {
    const slug = getSlug()
    if (!slug) return
    isochroneLoading.value = true
    isochroneError.value = null
    try {
      isochroneData.value = await fetchScenarioIsochrone(slug, {
        lat: payload.lat,
        lng: payload.lng,
        budget_mins: payload.duration,
        mode: payload.mode,
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale_graph' && attempt < MAX_STALE_GRAPH_RETRIES) {
        await triggerCompile(slug)
        if (!compileError.value) {
          await generateIsochrone(payload, attempt + 1)
          return
        }
      }
      isochroneError.value = 'Failed to generate isochrone. Please try again.'
    } finally {
      isochroneLoading.value = false
    }
  }

  async function handleIsochroneSubmit(payload: IsochronePayload): Promise<void> {
    origin.value = { lat: payload.lat, lng: payload.lng }
    await generateIsochrone(payload)
  }

  return {
    compiling,
    compileError,
    graph,
    setGraph,
    triggerCompile,
    resetCompile,
    origin,
    isochroneData,
    isochroneLoading,
    isochroneError,
    isochroneFormLoading,
    nearMisses,
    realisedClusters,
    onOriginChange,
    handleIsochroneSubmit,
  }
}
