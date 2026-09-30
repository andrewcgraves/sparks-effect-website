import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useOwnedList } from './useOwnedList'
import { SessionExpiredError } from '../api/authoring/client'

describe('useOwnedList', () => {
  it('starts loading with an empty list', () => {
    const { items, loading, error } = useOwnedList<string>(() => new Promise(() => {}))
    expect(loading.value).toBe(true)
    expect(items.value).toEqual([])
    expect(error.value).toBe(false)
  })

  it('populates items and clears loading on success', async () => {
    const { items, loading, error } = useOwnedList(() => Promise.resolve(['a', 'b']))
    await flushPromises()
    expect(loading.value).toBe(false)
    expect(items.value).toEqual(['a', 'b'])
    expect(error.value).toBe(false)
  })

  it('sets error and clears loading on failure, leaving items empty', async () => {
    const { items, loading, error } = useOwnedList(() => Promise.reject(new Error('boom')))
    await flushPromises()
    expect(loading.value).toBe(false)
    expect(error.value).toBe(true)
    expect(items.value).toEqual([])
  })

  it('fetches immediately without waiting for a caller to trigger it', () => {
    const fetcher = vi.fn().mockResolvedValue([])
    useOwnedList(fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports no failure when the session expired, leaving the page loading until the redirect lands', async () => {
    const { loading, error } = useOwnedList(() => Promise.reject(new SessionExpiredError('GET /api/services failed: 401')))
    await flushPromises()
    expect(error.value).toBe(false)
    expect(loading.value).toBe(true)
  })
})
