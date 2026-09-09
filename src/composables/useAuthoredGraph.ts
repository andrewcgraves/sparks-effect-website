import { computed, ref } from 'vue'
import { ApiError } from '../api/authoring/client'
import type { AuthoredIsochroneRequest, Job, TransitGraph, TravelMode } from '../api/authoring'
import { isochroneFault, isochroneRangeRefusal, isochroneRequested } from '../api/isochroneFault'
import type { ChainResponse } from '../fixtures/isochrone'
import { useCompileJob } from './useCompileJob'
import { latestAttempt } from './latestAttempt'
import { graphRoutes, graphStations } from './scenarioGraphMap'

export const MAX_STALE_GRAPH_RETRIES = 3

export interface IsochronePayload {
  lat: number
  lng: number
  duration: number
  mode: TravelMode
}

export interface AuthoredGraphTarget {
  compile: (slug: string, init?: RequestInit) => Promise<Job>
  fetchGraph: (slug: string) => Promise<TransitGraph>
  isochrone: (slug: string, request: AuthoredIsochroneRequest) => Promise<ChainResponse>
}

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

  const mapStations = computed(() => graphStations(graph.value))
  const mapRoutes = computed(() => graphRoutes(graph.value))

  // The compile is part of the same wait from the user's point of view.
  const isochroneFormLoading = computed(() => isochroneLoading.value || compiling.value)

  // A graph load and a plot are independent things to have superseded, so they
  // count separately. An attempt whose number is no longer current writes
  // nothing: a late answer to a question the user has already re-asked is worse
  // than no answer at all.
  const loads = latestAttempt()
  const plots = latestAttempt()

  // A 404 means it has never compiled, which is a reason to compile rather than
  // an error to show. Anything else is a genuine failure.
  async function loadGraph(slug: string): Promise<void> {
    const attempt = loads.begin()
    graphFailed.value = false
    // A load can end in a compile, so abandoning a load has to abandon the
    // compile it started too. Without this the older load's compile still
    // resolves into compiledGraph, which `graph` prefers — the newer load's
    // answer would be the one thrown away.
    resetCompile()
    try {
      const loaded = await target.fetchGraph(slug)
      if (!loads.isCurrent(attempt)) return
      loadedGraph.value = loaded
    } catch (err) {
      if (!loads.isCurrent(attempt)) return
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

  // An edit made elsewhere answers 409 (stale_graph) on the isochrone call
  // itself, not on compile — recompile and retry rather than making the user
  // work out why their scenario or service stopped plotting. `staleRetries`
  // counts across the whole gesture rather than per call, so a target that is
  // stale again the moment it is compiled gives up instead of looping.
  //
  // The slug is fixed for the duration of an attempt: it is the target the user
  // asked about, and re-reading it mid-retry could answer about another one.
  async function plot(slug: string, payload: IsochronePayload, attempt: number, staleRetries: number): Promise<void> {
    isochroneLoading.value = true
    isochroneError.value = null
    try {
      const data = await target.isochrone(slug, {
        lat: payload.lat,
        lng: payload.lng,
        budget_mins: payload.duration,
        mode: payload.mode,
      })
      if (!plots.isCurrent(attempt)) return
      isochroneData.value = data
    } catch (err) {
      if (!plots.isCurrent(attempt)) return
      if (err instanceof ApiError && err.code === 'stale_graph' && staleRetries < MAX_STALE_GRAPH_RETRIES) {
        await triggerCompile(slug)
        if (!plots.isCurrent(attempt)) return
        if (!compileError.value) {
          await plot(slug, payload, attempt, staleRetries + 1)
          return
        }
      }
      // Local range refusals are handled before the request; this is the arm
      // for the ones it could not see — notably a recompile that has just
      // moved or dropped the station the local check measured against — and
      // for every other routing fault (SPA-230, SPA-219).
      isochroneError.value = isochroneFault(err, payload.mode, payload.duration)
    } finally {
      // Left alone when superseded: the attempt that replaced this one set it,
      // and owns clearing it.
      if (plots.isCurrent(attempt)) isochroneLoading.value = false
    }
  }

  async function handleIsochroneSubmit(payload: IsochronePayload): Promise<void> {
    origin.value = { lat: payload.lat, lng: payload.lng }
    const slug = getSlug()
    // Checked before the attempt is numbered, so a submit that cannot go
    // anywhere does not supersede one that is still in flight.
    if (!slug) return

    // An origin with no station within reach is refused here rather than by the
    // API, which would refuse it too (SPA-200) a round trip later. It is
    // measured against the compiled graph's own stations, which is the very set
    // the API measures against — so unlike the seeded page, the two agree
    // exactly. Numbered like the plot it stands in for, so it supersedes an
    // in-flight plot the same way a real one would.
    const refusal = isochroneRangeRefusal(mapStations.value, payload, payload.mode, payload.duration)
    if (refusal) {
      plots.begin()
      isochroneData.value = null
      isochroneLoading.value = false
      isochroneError.value = refusal
      return
    }

    isochroneRequested(payload.mode, payload.duration)
    await plot(slug, payload, plots.begin(), 1)
  }

  // Bumping both counters is what makes the abandonment stick:
  // requests already issued cannot be recalled, only ignored when they land.
  function reset(): void {
    loads.supersede()
    plots.supersede()
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
