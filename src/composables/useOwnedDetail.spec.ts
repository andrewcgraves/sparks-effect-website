import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useOwnedDetail } from './useOwnedDetail'
import { ApiError } from '../api/authoring/client'

describe('useOwnedDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls the fetcher with the given slug', () => {
    const fetcher = vi.fn().mockResolvedValue({ slug: 'a' })
    useOwnedDetail(fetcher, 'a')
    expect(fetcher).toHaveBeenCalledWith('a')
  })

  it('starts loading with no item', () => {
    const { item, loading, notFound, error } = useOwnedDetail(vi.fn().mockResolvedValue({}), 'a')
    expect(item.value).toBeNull()
    expect(loading.value).toBe(true)
    expect(notFound.value).toBe(false)
    expect(error.value).toBe(false)
  })

  it('populates the item and stops loading once the fetch resolves', async () => {
    const value = { slug: 'a', name: 'A' }
    const { item, loading } = useOwnedDetail(vi.fn().mockResolvedValue(value), 'a')
    await flushPromises()
    expect(item.value).toEqual(value)
    expect(loading.value).toBe(false)
  })

  it('sets notFound on a 404', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('not found', 404))
    const { item, loading, notFound, error } = useOwnedDetail(fetcher, 'gone')
    await flushPromises()
    expect(notFound.value).toBe(true)
    expect(error.value).toBe(false)
    expect(item.value).toBeNull()
    expect(loading.value).toBe(false)
  })

  it('sets error, not notFound, on a non-404 failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new ApiError('server error', 500))
    const { notFound, error, loading } = useOwnedDetail(fetcher, 'a')
    await flushPromises()
    expect(error.value).toBe(true)
    expect(notFound.value).toBe(false)
    expect(loading.value).toBe(false)
  })

  it('sets error, not notFound, on a network failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { notFound, error } = useOwnedDetail(fetcher, 'a')
    await flushPromises()
    expect(error.value).toBe(true)
    expect(notFound.value).toBe(false)
  })
})
