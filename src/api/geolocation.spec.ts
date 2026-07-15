import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentPosition } from './geolocation'

describe('getCurrentPosition', () => {
  const mockGetCurrentPosition = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: mockGetCurrentPosition,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('resolves with lat and lng when geolocation succeeds', async () => {
    mockGetCurrentPosition.mockImplementation((success) => {
      success({
        coords: { latitude: 45.5231, longitude: -122.6784 },
      })
    })

    const result = await getCurrentPosition()

    expect(result).toEqual({ lat: 45.5231, lng: -122.6784 })
  })

  it('rejects with a permission-denied error when geolocation is denied', async () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 1, message: 'User denied Geolocation' })
    })

    await expect(getCurrentPosition()).rejects.toThrow('permission denied')
  })

  it('rejects with an unavailable error when position is unavailable', async () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 2, message: 'Position unavailable' })
    })

    await expect(getCurrentPosition()).rejects.toThrow('position unavailable')
  })

  it('rejects with a timeout error when geolocation times out', async () => {
    mockGetCurrentPosition.mockImplementation((_success, error) => {
      error({ code: 3, message: 'Timeout expired' })
    })

    await expect(getCurrentPosition()).rejects.toThrow('timeout')
  })
})
