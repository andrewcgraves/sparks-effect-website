// PROTOTYPE (SPA-429) — throwaway. Phone-layout variants for ScenarioView.
// Plan: three structurally different phone layouts, plus the current stacked
// one as a baseline, on the existing /scenario/:slug route, switched with
// ?variant=A|B|C|current and active only below `md`. Desktop is untouched.
//
// ScenarioView keeps every fetch and handler; it provides them here so each
// variant only decides where things go on screen.
import type { InjectionKey } from 'vue'
import type { Route, Service, Station } from '../../api/scenarios'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { TimeRemainingGraph } from '../../components/timeRemaining'
import type { segmentStationTimeGroups } from '../../components/stationTimes'

export type Mode = 'walk' | 'bike' | 'drive'
export type PlotPayload = { lat: number; lng: number; duration: number; mode: Mode }
export type LatLng = { lat: number; lng: number }

export interface PhonePage {
  slug: string
  name: string
  description: string
  routes: Route[]
  stations: Station[]
  services: Service[]
  origin: LatLng | null
  isochroneData: ChainResponse | null
  isLoading: boolean
  fetchError: string | null
  timeRemaining: TimeRemainingGraph
  stationTimeGroups: ReturnType<typeof segmentStationTimeGroups>
  travelTimesLoading: boolean
  travelTimesFailed: boolean
  activeStation: { slug: string; fromMap: boolean } | null
  selectedPrerenderedId: string | null
  submit: (payload: PlotPayload) => Promise<void>
  setOrigin: (coords: LatLng | null) => void
  highlight: (slug: string | null, fromMap: boolean) => void
  showIsochrone: (result: ChainResponse) => void
}

export const PHONE_PAGE: InjectionKey<PhonePage> = Symbol('phone-page')

export const DURATION_OPTIONS = [45, 60, 75, 120, 180, 240]
export const MODE_LABEL: Record<Mode, string> = { walk: 'Walk', bike: 'Bike', drive: 'Drive' }
