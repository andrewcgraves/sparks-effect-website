// PROTOTYPE (SPA-414) — throwaway. Lives on prototype/spa-414-home-page only.
// Gathers everything the home-page variants draw: the cover index, route
// geometry per network, and one prerendered splash zone. Every read falls back
// to checked-in sample data so the variants can be judged with no API running.
import { reactive } from 'vue'
import { fetchCoverIndex, type CoverCard } from '../../api/coverIndex'
import { fetchScenario } from '../../api/scenarios'
import { fetchPrerenderedIsochrone, listPrerenderedIsochrones } from '../../api/prerenderedIsochrones'
import { staticIsochroneResponse, type ChainResponse } from '../../fixtures/isochrone'

export type LngLat = [number, number]

export interface ThumbStation {
  name: string
  at: LngLat
  slug?: string
}

export interface FeaturedLine {
  kind: 'scenario' | 'service'
  slug: string
  name: string
  caption: string
  to: string
  // Several alignments for a network, one for a line; empty when unknown.
  paths: LngLat[][]
  stations: ThumbStation[]
}

export interface HeroSplash {
  label: string
  origin: LngLat
  budgetMins: number
  chain: ChainResponse
  paths: LngLat[][]
  stations: ThumbStation[]
}

const CA_HSR_STATIONS: ThumbStation[] = [
  { name: 'San Francisco', at: [-122.394, 37.789], slug: 'sf' },
  { name: 'Millbrae', at: [-122.387, 37.6], slug: 'millbrae' },
  { name: 'San Jose', at: [-121.903, 37.33], slug: 'san-jose' },
  { name: 'Gilroy', at: [-121.567, 37.004], slug: 'gilroy' },
  { name: 'Merced', at: [-120.483, 37.302] },
  { name: 'Fresno', at: [-119.784, 36.737] },
  { name: 'Kings/Tulare', at: [-119.62, 36.32] },
  { name: 'Bakersfield', at: [-119.02, 35.37] },
  { name: 'Palmdale', at: [-118.12, 34.58] },
  { name: 'Burbank', at: [-118.35, 34.2] },
  { name: 'Los Angeles', at: [-118.236, 34.056] },
]

const COAST_STATIONS: ThumbStation[] = [
  { name: 'San Francisco', at: [-122.394, 37.776] },
  { name: 'San Jose', at: [-121.903, 37.33] },
  { name: 'Salinas', at: [-121.656, 36.678] },
  { name: 'Paso Robles', at: [-120.691, 35.626] },
  { name: 'San Luis Obispo', at: [-120.655, 35.276] },
  { name: 'Santa Barbara', at: [-119.698, 34.414] },
  { name: 'Ventura', at: [-119.293, 34.278] },
  { name: 'Los Angeles', at: [-118.236, 34.056] },
]

const CAPITOL_STATIONS: ThumbStation[] = [
  { name: 'Sacramento', at: [-121.5, 38.585] },
  { name: 'Davis', at: [-121.738, 38.544] },
  { name: 'Martinez', at: [-122.136, 38.019] },
  { name: 'Richmond', at: [-122.353, 37.937] },
  { name: 'Oakland', at: [-122.277, 37.794] },
  { name: 'Fremont', at: [-121.966, 37.559] },
  { name: 'San Jose', at: [-121.903, 37.33] },
]

const SAMPLE_LINES: FeaturedLine[] = [
  {
    kind: 'scenario',
    slug: 'ca-hsr',
    name: 'California High-Speed Rail',
    caption: 'San Francisco to Los Angeles in under three hours',
    to: '/scenario/ca-hsr',
    paths: [CA_HSR_STATIONS.map((s) => s.at)],
    stations: CA_HSR_STATIONS,
  },
  {
    kind: 'service',
    slug: 'coast-express',
    name: 'Coast Express',
    caption: 'Hourly limited-stop service along the Central Coast',
    to: '/services/coast-express',
    paths: [COAST_STATIONS.map((s) => s.at)],
    stations: COAST_STATIONS,
  },
  {
    kind: 'service',
    slug: 'capitol-express',
    name: 'Capitol Express',
    caption: 'Sacramento to San Jose every 30 minutes',
    to: '/services/capitol-express',
    paths: [CAPITOL_STATIONS.map((s) => s.at)],
    stations: CAPITOL_STATIONS,
  },
]

const SAMPLE_HERO: HeroSplash = {
  label: 'From downtown San Jose, 90 minutes',
  origin: [-121.889, 37.338],
  budgetMins: 90,
  chain: staticIsochroneResponse,
  paths: [CA_HSR_STATIONS.slice(0, 5).map((s) => s.at)],
  stations: CA_HSR_STATIONS.slice(0, 4),
}

export type ForcedState = 'none' | 'one-failed' | 'both-failed' | 'empty'

export interface HomeData {
  loading: boolean
  source: 'live' | 'sample'
  lines: FeaturedLine[]
  unavailable: string[]
  hero: HeroSplash
  // Lets the switcher bar force the failure states without an API.
  forced: ForcedState
}

async function liveLines(cards: CoverCard[]): Promise<FeaturedLine[]> {
  return Promise.all(
    cards.slice(0, 4).map(async (card) => {
      const base: FeaturedLine = { ...card, caption: card.caption ?? '', paths: [], stations: [] }
      // Only networks have public geometry today: the published-lines index
      // carries none, so a live line card draws the placeholder thumbnail.
      if (card.kind !== 'scenario') return base
      try {
        const detail = await fetchScenario(card.slug)
        return {
          ...base,
          paths: detail.routes.map((r) => r.geometry.coordinates as LngLat[]),
          stations: detail.stations.map((s) => ({ name: s.name, at: s.location.coordinates })),
        }
      } catch {
        return base
      }
    }),
  )
}

async function liveHero(): Promise<HeroSplash | null> {
  const list = await listPrerenderedIsochrones('ca-hsr')
  const pick = list.find((e) => !e.outdated) ?? list[0]
  if (!pick) return null
  const [detail, scenario] = await Promise.all([fetchPrerenderedIsochrone(pick.id), fetchScenario('ca-hsr')])
  return {
    label: pick.label,
    origin: [pick.lng, pick.lat],
    budgetMins: pick.budget_mins,
    chain: detail.result,
    paths: scenario.routes.map((r) => r.geometry.coordinates as LngLat[]),
    stations: scenario.stations.map((s) => ({ name: s.name, at: s.location.coordinates, slug: s.slug })),
  }
}

export function useHomePrototypeData(): HomeData {
  const data = reactive<HomeData>({
    loading: true,
    source: 'sample',
    lines: SAMPLE_LINES,
    unavailable: [],
    hero: SAMPLE_HERO,
    forced: 'none',
  })

  // The page's specs mock fetchCoverIndex once, for the real page; leave it to them.
  if (import.meta.env.MODE === 'test') {
    data.loading = false
    return data
  }

  const cover = fetchCoverIndex().then(async (index) => ({ index, lines: await liveLines(index.cards) }))
  Promise.allSettled([cover, liveHero()])
    .then(([coverResult, heroResult]) => {
      if (coverResult.status === 'fulfilled' && coverResult.value.lines.length > 0) {
        data.source = 'live'
        data.lines = coverResult.value.lines
        data.unavailable = coverResult.value.index.unavailable
      }
      if (heroResult.status === 'fulfilled' && heroResult.value) data.hero = heroResult.value
    })
    .finally(() => { data.loading = false })

  return data
}

// What a variant should render for its lines, once the forced state applies.
export function visibleLines(data: HomeData): { lines: FeaturedLine[]; unavailable: string[]; failed: boolean } {
  switch (data.forced) {
    case 'both-failed': return { lines: [], unavailable: [], failed: true }
    case 'one-failed': return { lines: data.lines.filter((l) => l.kind === 'scenario'), unavailable: ['service'], failed: false }
    case 'empty': return { lines: [], unavailable: [], failed: false }
    default: return { lines: data.lines, unavailable: data.unavailable, failed: false }
  }
}

export const UNAVAILABLE_COPY: Record<string, string> = {
  scenario: 'Couldn’t load the curated networks right now.',
  service: 'Couldn’t load the published lines right now.',
}

export const PITCH =
  'Sparks Effect shows everywhere you could reach if a proposed train line were running today — walk to a station, ride, and see your splash zone.'

export const STEPS = [
  { title: 'Pick a place', body: 'Your home, your office, anywhere near a proposed line.' },
  { title: 'Choose how you reach the station', body: 'Walk, bike or drive to the platform.' },
  { title: 'See where the line takes you', body: 'Every place you could get to within your time budget.' },
]
