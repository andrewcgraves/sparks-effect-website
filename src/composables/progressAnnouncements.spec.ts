// @vitest-environment node

import { describe, expect, it } from 'vitest'
import type { ChainResponse } from '../fixtures/isochrone'
import { compiledMessage, compilingMessage, splashZoneReadyMessage } from './progressAnnouncements'

function reaching(count: number): ChainResponse {
  return {
    type: 'FeatureCollection',
    features: [],
    metadata: {
      reachable_stations: Array.from({ length: count }, (_, i) => ({
        station_slug: `s${i}`, access_mins: 1, access_secs: 60, remaining_mins: 1, remaining_secs: 60,
      })),
      origin_budget_mins: 30,
      compile_job_id: 'job1',
      mode: 'walk',
      wait_model: 'half-headway',
      origin_iso_available: true,
    },
  } as ChainResponse
}

describe('progress announcements', () => {
  it('speaks of a compile in the product word for what is compiling', () => {
    expect(compilingMessage('service')).toBe('Compiling line…')
    expect(compiledMessage('service')).toBe('Line compiled')
    expect(compilingMessage('scenario')).toBe('Compiling network…')
    expect(compiledMessage('scenario')).toBe('Network compiled')
  })

  it('says how many stations a splash zone reaches', () => {
    expect(splashZoneReadyMessage(reaching(23))).toBe('Splash zone ready: 23 stations reached')
    expect(splashZoneReadyMessage(reaching(1))).toBe('Splash zone ready: 1 station reached')
    expect(splashZoneReadyMessage(reaching(0))).toBe('Splash zone ready: no stations reached')
  })
})
