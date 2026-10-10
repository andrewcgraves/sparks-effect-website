import { addProtocol } from 'maplibre-gl'
import type { Map } from 'maplibre-gl'
import type { MapModule } from './mapLifecycle'
import { addLayerInStack } from './layerStack'
import { railTilesUrl } from '../railTilesUrl'
import { readThemeToken } from '../themeTokens'

import { RAIL_CONSTRUCTION_LAYER_ID, RAIL_EXISTING_LAYER_ID, RAIL_PROPOSED_LAYER_ID } from './railLayerIds'

export { RAIL_CONSTRUCTION_LAYER_ID, RAIL_EXISTING_LAYER_ID, RAIL_PROPOSED_LAYER_ID } from './railLayerIds'
export const RAIL_SOURCE_ID = 'rail-overlay-source'
export const RAIL_SOURCE_LAYER = 'rail'
export const RAIL_MIN_ZOOM = 8
export const PMTILES_PROTOCOL = 'pmtiles'
export const RAIL_EXISTING_WIDTH = 2
export const RAIL_CONSTRUCTION_WIDTH = 2
export const RAIL_PROPOSED_WIDTH = 1.5
export const RAIL_PROPOSED_OPACITY = 0.7

export interface RailOverlayModule extends MapModule {
  available: boolean
}

let protocolRegistration: Promise<void> | null = null

// MapLibre protocols are registered once per page, not per map, and the
// pmtiles package is only pulled in here so the builder's route is the one
// chunk that carries it.
export function registerPmtilesProtocol(): Promise<void> {
  return (protocolRegistration ??= import('pmtiles').then(({ Protocol }) => {
    addProtocol(PMTILES_PROTOCOL, new Protocol().tile)
  }))
}

function addRailLayers(map: Map, url: string): void {
  // Railways that are there are the ones a route is drawn along, so they read
  // strongest: solid, in the muted ink, a step under the drawn route's
  // accent. Planned ones fade with how far off they are, construction in the
  // faint ink and proposed fainter and thinner still.
  const existing = readThemeToken('--color-ink-muted')
  const planned = readThemeToken('--color-ink-faint')
  map.addSource(RAIL_SOURCE_ID, { type: 'vector', url: `${PMTILES_PROTOCOL}://${url}` })
  const line = {
    type: 'line' as const,
    source: RAIL_SOURCE_ID,
    'source-layer': RAIL_SOURCE_LAYER,
    minzoom: RAIL_MIN_ZOOM,
  }
  addLayerInStack(map, {
    ...line,
    id: RAIL_EXISTING_LAYER_ID,
    filter: ['match', ['get', 'railway'], ['construction', 'proposed'], false, true],
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': existing, 'line-width': RAIL_EXISTING_WIDTH },
  })
  // Butt caps on the dashed states: a round cap adds half a width to each
  // dash, and the short proposed pattern would close up into a solid line.
  addLayerInStack(map, {
    ...line,
    id: RAIL_CONSTRUCTION_LAYER_ID,
    filter: ['==', ['get', 'railway'], 'construction'],
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: { 'line-color': planned, 'line-width': RAIL_CONSTRUCTION_WIDTH, 'line-dasharray': [4, 2.5] },
  })
  addLayerInStack(map, {
    ...line,
    id: RAIL_PROPOSED_LAYER_ID,
    filter: ['==', ['get', 'railway'], 'proposed'],
    layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': planned,
      'line-width': RAIL_PROPOSED_WIDTH,
      'line-opacity': RAIL_PROPOSED_OPACITY,
      'line-dasharray': [1.5, 2.5],
    },
  })
}

export function railOverlayModule(url: string | null = railTilesUrl()): RailOverlayModule {
  // Bumped on every attach and detach, so a protocol registration that lands
  // after the map has gone adds nothing to it.
  let generation = 0

  return {
    available: url !== null,
    deps: () => null,
    isReady: (styleLoaded) => styleLoaded && url !== null,
    attach: (map) => {
      if (url === null) return
      const mine = ++generation
      void registerPmtilesProtocol().then(() => {
        if (mine === generation) addRailLayers(map, url)
      })
    },
    sync: () => {},
    detach: () => {
      generation++
    },
  }
}
