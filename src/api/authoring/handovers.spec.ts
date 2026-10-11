// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acceptHandover,
  cancelHandover,
  declineHandover,
  fetchMyHandovers,
  handoverBlockingScenarios,
  offerHandover,
  type MyHandovers,
} from './handovers'
import { ApiError } from './client'

function respond(status: number, body: unknown): void {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status < 400,
    status,
    json: async () => body,
    headers: new Headers(),
  } as Response)
}

function lastCall(): { url: string; method: string; body: unknown } {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!
  const request = init as RequestInit | undefined
  return {
    url: String(url),
    method: request?.method ?? 'GET',
    body: request?.body ? JSON.parse(String(request.body)) : undefined,
  }
}

const mine: MyHandovers = {
  incoming: [{
    id: 'h-in',
    service_slug: 'coast-line',
    service_name: 'Coast Line',
    from_name: 'Grace',
    status: 'pending',
    created_at: '2026-10-01T00:00:00Z',
    expires_at: '2026-10-15T00:00:00Z',
  }],
  outgoing: [],
}

describe('handovers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers a service by POSTing the recipient email to its handovers', async () => {
    respond(202, { to_email: 'ada@example.com' })
    await offerHandover('coast-line', 'ada@example.com')
    expect(lastCall()).toMatchObject({
      method: 'POST',
      body: { to_email: 'ada@example.com' },
    })
    expect(lastCall().url).toMatch(/\/api\/services\/coast-line\/handovers$/)
  })

  it('reads the caller\'s pending handovers, both ways', async () => {
    respond(200, mine)
    await expect(fetchMyHandovers()).resolves.toEqual(mine)
    expect(lastCall().url).toMatch(/\/api\/me\/handovers$/)
  })

  it.each([
    ['cancel', cancelHandover],
    ['decline', declineHandover],
    ['accept', acceptHandover],
  ])('%ss a handover by POSTing to its own route', async (action, call) => {
    respond(200, mine.incoming[0])
    await call('h-in')
    expect(lastCall().method).toBe('POST')
    expect(lastCall().url).toMatch(new RegExp(`/api/handovers/h-in/${action}$`))
  })

  describe('handoverBlockingScenarios', () => {
    it('names the sender\'s scenarios that still hold the service', () => {
      const err = new ApiError('conflict', 409, 'service_in_scenarios', { scenarios: ['bay-loop', 'peninsula'] })
      expect(handoverBlockingScenarios(err)).toEqual(['bay-loop', 'peninsula'])
    })

    it('still recognises the refusal when it names no scenarios', () => {
      const err = new ApiError('conflict', 409, 'service_in_scenarios', null)
      expect(handoverBlockingScenarios(err)).toEqual([])
    })

    it('is null for any other failure', () => {
      expect(handoverBlockingScenarios(new ApiError('conflict', 409))).toBeNull()
      expect(handoverBlockingScenarios(new Error('offline'))).toBeNull()
    })
  })
})
