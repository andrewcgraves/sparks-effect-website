import { computed, ref } from 'vue'
import { ApiError } from '../api/authoring/client'
import type { AuthoredIsochroneRequest, Job, TransitGraph } from '../api/authoring'
import type { ChainResponse } from '../fixtures/isochrone'
import { useCompileJob } from './useCompileJob'
import { graphRoutes, graphStations } from './scenarioGraphMap'

// A stale-graph retry should settle in one or two hops in practice; this just
// bounds it so a persistently stale signal can't spin the UI forever. It is the
// one copy — nothing else recovers from stale_graph.
export const MAX_STALE_GRAPH_RETRIES = 3

export interface IsochronePayload {
  lat: number
  lng: number
  duration: number
  mode: 'walk' | 'bike' | 'drive'
}

/**
 * The endpoints an authored target answers on, injected rather than imported so
 * one implementation serves both Services and Scenarios. A Service compiled
 * alone is the degenerate one-member Scenario, so the two differ in nothing but
 * which trio of endpoints they are plotted against.
 */
export interface AuthoredGraphTarget {
  compile: (slug: string) => Promise<Job>
  fetchGraph: (slug: string) => Promise<TransitGraph>
  isochrone: (slug: string, request: AuthoredIsochroneRequest) => Promise<ChainResponse>
}

/**
 * The whole graph lifecycle of an authored Service or Scenario: read the graph
 * it already has, compile one if it has none, plot isochrones against it, and
 * recompile when the server says the graph has fallen behind an edit.
 *
 * Those four were split across a compile composable, an isochrone composable,
 * and each detail view's own copy of "fetch the graph, or compile on a 404".
 * The sequencing between them is what is worth owning in one place: a stale
 * isochrone recompiles and retries, so a single user gesture can have two
 * requests and a job poll in flight, and the retry bound has to be counted
 * across all of it rather than per call.
 *
 * The slug arrives as a getter because callers resolve it late, from their route
 * props rather than at setup time.
 */
export function useAuthoredGraph(getSlug: () => string | null, target: AuthoredGraphTarget) {
  const {
    compiling,
    compileError,
    result: compiledGraph,
    trigger: triggerCompile,
    reset: resetCompile,
  } = useCompileJob(target.compile)

  // A page that opens an already-compiled record reads its graph rather than
  // recompiling; a fresh compile supersedes it.
  const loadedGraph = ref<TransitGraph | null>(null)
  const graph = computed(() => compiledGraph.value ?? loadedGraph.value)

  // A fact, not a sentence: the wording belongs to whichever page is reporting
  // it, since only the page knows what it was trying to load.
  const graphFailed = ref(false)

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

  // Each concern counts its own attempts, since a graph load and a plot are
  // independent things to have superseded. An attempt whose number is no longer
  // current writes nothing: the user is waiting on a later one, and a late
  // answer to a question they have already re-asked is worse than none.
  let graphGeneration = 0
  let isochroneGeneration = 0

  /**
   * Reads the graph this target already compiled, compiling it for the first
   * time if it has none.
   *
   * A 404 means it has never compiled, which is a reason to compile rather than
   * an error to show. Anything else is a genuine failure.
   */
  async function loadGraph(slug: string): Promise<void> {
    const attempt = ++graphGeneration
    graphFailed.value = false
    try {
      const loaded = await target.fetchGraph(slug)
      if (attempt !== graphGeneration) return
      loadedGraph.value = loaded
    } catch (err) {
      if (attempt !== graphGeneration) return
      if (err instanceof ApiError && err.status === 404) {
        await triggerCompile(slug)
        return
      }
      graphFailed.value = true
    }
  }

  function onOriginChange(coords: { lat: number; lng: number } | null): void {
    origin.value = coords
  }

  /**
   * Plots one isochrone, recovering from a graph that has gone stale.
   *
   * An edit made elsewhere answers 409 (stale_graph) on the isochrone call
   * itself, not on compile — recompile and retry rather than making the user
   * work out why their scenario or service stopped plotting. `tries` counts
   * across the whole gesture rather than per call, so a target that is stale
   * again the moment it is compiled gives up instead of looping.
   *
   * The slug is fixed for the duration of an attempt: it is the target the user
   * asked about, and re-reading it mid-retry could answer about another one.
   */
  async function plot(slug: string, payload: IsochronePayload, attempt: number, tries: number): Promise<void> {
    isochroneLoading.value = true
    isochroneError.value = null
    try {
      const data = await target.isochrone(slug, {
        lat: payload.lat,
        lng: payload.lng,
        budget_mins: payload.duration,
        mode: payload.mode,
      })
      if (attempt !== isochroneGeneration) return
      isochroneData.value = data
    } catch (err) {
      if (attempt !== isochroneGeneration) return
      if (err instanceof ApiError && err.code === 'stale_graph' && tries < MAX_STALE_GRAPH_RETRIES) {
        await triggerCompile(slug)
        if (attempt !== isochroneGeneration) return
        if (!compileError.value) {
          await plot(slug, payload, attempt, tries + 1)
          return
        }
      }
      isochroneError.value = 'Failed to generate isochrone. Please try again.'
    } finally {
      // Left alone when superseded: the attempt that replaced this one set it,
      // and owns clearing it.
      if (attempt === isochroneGeneration) isochroneLoading.value = false
    }
  }

  async function handleIsochroneSubmit(payload: IsochronePayload): Promise<void> {
    origin.value = { lat: payload.lat, lng: payload.lng }
    const slug = getSlug()
    // Checked before the attempt is numbered, so a submit that cannot go
    // anywhere does not supersede one that is still in flight.
    if (!slug) return
    await plot(slug, payload, ++isochroneGeneration, 1)
  }

  // Abandons everything in flight and returns to the state of a page that has
  // just opened. Bumping both counters is what makes the abandonment stick:
  // requests already issued cannot be recalled, only ignored when they land.
  function reset(): void {
    graphGeneration++
    isochroneGeneration++
    resetCompile()
    loadedGraph.value = null
    graphFailed.value = false
    origin.value = null
    isochroneData.value = null
    isochroneLoading.value = false
    isochroneError.value = null
  }

  return {
    compiling,
    compileError,
    graph,
    graphFailed,
    loadGraph,
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
    reset,
  }
}
