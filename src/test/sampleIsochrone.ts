import type { ChainResponse } from '../fixtures/isochrone'
import sampleIsochroneResponse from '../fixtures/sample-isochrone-response.json'

// Specs only: imported from production code, the 29.5 kB response would ride
// along in the map chunk (SPA-493).
export const staticIsochroneResponse = sampleIsochroneResponse as ChainResponse
