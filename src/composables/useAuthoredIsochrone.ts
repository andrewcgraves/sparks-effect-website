import { computed, ref } from 'vue'
import { ApiError } from '../api/authoring/client'
import type { AuthoredIsochroneRequest, Job, TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'
import { MAX_STALE_GRAPH_RETRIES, useCompileJob } from './useCompileJob'
import { graphRoutes, graphStations } from './scenarioGraphMap'

export interface IsochronePayload {
  lat: number
  lng: number
  duration: number
  mode: 'walk' | 'bike' | 'drive'
}

/**
 * The two endpoints this drives, injected rather than imported so one
 * implementation serves both resources.
 */
export interface IsochroneApi {
  compile: (slug: string) => Promise<Job>
  isochrone: (slug: string, request: AuthoredIsochroneRequest) => Promise<ChainResponse>
}

/**
 * The isochrone half of a compiled scenario or service: plotting against its
 * graph, and the compile lifecycle that keeps that graph current. Shared by the
 * scenario detail page and the service detail page, which differ only in which
 * pair of endpoints they plot against — so the stale-graph dance has one
 * implementation rather than one per resource.
 *
 * The slug arrives as a getter because callers resolve it late, from their route
 * props rather than at setup time.
 */
export function useAuthoredIsochrone(getSlug: () => string | null, api: IsochroneApi) {
  const { compiling, compileError, result: compiledGraph, trigger: triggerCompile } = useCompileJob(api.compile)

  // A page that opens an already-compiled record reads its graph rather than
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

  // The compiled graph, projected onto the point/line shapes MapView draws.
  const mapStations = computed(() => graphStations(graph.value))
  const mapRoutes = computed(() => graphRoutes(graph.value))

  // The compile is part of the same wait from the user's point of view.
  const isochroneFormLoading = computed(() => isochroneLoading.value || compiling.value)

  function setGraph(value: TransitGraph | null): void {
    loadedGraph.value = value
  }

  function onOriginChange(coords: { lat: number; lng: number } | null): void {
    origin.value = coords
  }

  // An edit made elsewhere answers 409 (stale_graph) on the isochrone call
  // itself, not just on compile — recompile and retry rather than making the
  // user work out why their scenario or service stopped plotting.
  async function generateIsochrone(payload: IsochronePayload, attempt = 1): Promise<void> {
    const slug = getSlug()
    if (!slug) return
    isochroneLoading.value = true
    isochroneError.value = null
    try {
      isochroneData.value = await api.isochrone(slug, {
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
    origin,
    isochroneData,
    isochroneLoading,
    isochroneError,
    isochroneFormLoading,
    nearMisses,
    realisedClusters,
    mapStations,
    mapRoutes,
    onOriginChange,
    handleIsochroneSubmit,
  }
}
