import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'

vi.mock('../api/scenarios', () => ({ fetchScenarioTravelTimes: vi.fn() }))

import { useScenarioTravelTimes } from './useScenarioTravelTimes'
import { fetchScenarioTravelTimes } from '../api/scenarios'
import type { TravelTimes } from '../api/scenarios'

const stub: TravelTimes = {
  scenario_slug: 'ca-hsr',
  provenance: 'calibrated',
  source: 'seed',
  segments: [{ from: 'sf', to: 'sj', run_seconds: 1800 }],
}

describe('useScenarioTravelTimes', () => {
  beforeEach(() => {
    vi.mocked(fetchScenarioTravelTimes).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the segments for the named scenario', async () => {
    vi.mocked(fetchScenarioTravelTimes).mockResolvedValue(stub)
    const { segments, loading, failed } = useScenarioTravelTimes('ca-hsr')
    expect(loading.value).toBe(true)
    await flushPromises()
    expect(fetchScenarioTravelTimes).toHaveBeenCalledWith('ca-hsr')
    expect(segments.value).toEqual(stub.segments)
    expect(loading.value).toBe(false)
    expect(failed.value).toBe(false)
  })

  it('reports a failure and logs it rather than surfacing an error to the page', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchScenarioTravelTimes).mockRejectedValue(new Error('API down'))
    const { segments, loading, failed } = useScenarioTravelTimes('ca-hsr')
    await flushPromises()
    expect(failed.value).toBe(true)
    expect(loading.value).toBe(false)
    expect(segments.value).toEqual([])
    expect(logged).toHaveBeenCalled()
  })
})
