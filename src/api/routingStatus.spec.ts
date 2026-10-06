// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRoutingStatus } from './routingStatus'

function answer(body: unknown): Response {
  return { ok: true, json: async () => body } as Response
}

describe('fetchRoutingStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the status from the public routing-status endpoint', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer({ status: 'degraded', oldest_queued_secs: 75, inflight: 4 }))

    await expect(fetchRoutingStatus()).resolves.toBe('degraded')
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('/api/routing/status')
  })

  it('reads a status it does not know as ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer({ status: 'maintenance' }))

    await expect(fetchRoutingStatus()).resolves.toBe('ok')
  })

  it('reads an answer with no status as ok', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(answer(null))

    await expect(fetchRoutingStatus()).resolves.toBe('ok')
  })
})
