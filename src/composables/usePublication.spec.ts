// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/authoring/client'
import type { PublicationSnapshot, ServicePublication } from '../api/publications'

vi.mock('../api/publications', () => ({
  fetchServicePublication: vi.fn(),
  publishService: vi.fn(),
  unpublishService: vi.fn(),
}))

import { fetchServicePublication, publishService, unpublishService } from '../api/publications'
import { PUBLISH_COMPILE_FAILED, PUBLISH_RACED_EDIT, instant, usePublication } from './usePublication'

const PUBLISHED_AT = '2026-09-20T12:00:00.123456Z'

function snapshot(publishedAt = PUBLISHED_AT): PublicationSnapshot {
  return {
    user_service_id: 'svc1',
    compile_job_id: 'job1',
    name: 'Northbound Express',
    routes: [],
    published_at: publishedAt,
  }
}

function setup(updatedAt: string | undefined, recompile = vi.fn().mockResolvedValue(true)) {
  const publication = usePublication(() => 'northbound-express', () => updatedAt, recompile)
  return { ...publication, recompile }
}

describe('instant', () => {
  it('reads the sub-millisecond timestamps Go and Postgres write', () => {
    expect(instant('2026-09-20T12:00:00.123456789Z')).toBe(Date.UTC(2026, 8, 20, 12, 0, 0, 123))
  })

  it('reads a timestamp with no fraction at all', () => {
    expect(instant('2026-09-20T12:00:00Z')).toBe(Date.UTC(2026, 8, 20, 12))
  })

  it('is NaN for a missing timestamp', () => {
    expect(instant(undefined)).toBeNaN()
  })
})

describe('usePublication', () => {
  beforeEach(() => {
    vi.mocked(fetchServicePublication).mockReset()
    vi.mocked(publishService).mockReset()
    vi.mocked(unpublishService).mockReset()
  })

  describe('state', () => {
    it('is checking until the publication read answers', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      const { state, check } = setup('2026-09-20T11:00:00Z')
      const pending = check()
      expect(state.value).toBe('checking')
      await pending
      expect(fetchServicePublication).toHaveBeenCalledWith('northbound-express')
    })

    it('is unpublished on a 404', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      const { state, check } = setup('2026-09-20T11:00:00Z')
      await check()
      expect(state.value).toBe('unpublished')
    })

    it('is current when the draft has not changed since publishing', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      const { state, check } = setup('2026-09-20T11:59:59.999999Z')
      await check()
      expect(state.value).toBe('current')
    })

    it('has unpublished changes when the draft was edited after publishing', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      const { state, check } = setup('2026-09-20T12:00:01.5Z')
      await check()
      expect(state.value).toBe('changed')
    })

    it('reads as current when the draft carries no timestamp to compare', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      const { state, check } = setup(undefined)
      await check()
      expect(state.value).toBe('current')
    })

    it('is unknown, not unpublished, when the read fails for another reason', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('boom', 500))
      const { state, check } = setup('2026-09-20T11:00:00Z')
      await check()
      expect(state.value).toBe('unknown')
    })

    it('keeps only the latest check when two overlap', async () => {
      let answerFirst: (pub: ServicePublication) => void = () => {}
      vi.mocked(fetchServicePublication)
        .mockReturnValueOnce(new Promise((resolve) => { answerFirst = resolve }))
        .mockRejectedValueOnce(new ApiError('not found', 404))
      const { state, check } = setup('2026-09-20T11:00:00Z')
      const first = check()
      await check()
      answerFirst(snapshot() as ServicePublication)
      await first
      expect(state.value).toBe('unpublished')
    })
  })

  describe('publish', () => {
    it('pins the current compile without compiling when it is not stale', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-21T09:00:00Z'))
      const { state, check, publish, recompile, error } = setup('2026-09-20T11:00:00Z')
      await check()
      await publish()
      expect(publishService).toHaveBeenCalledWith('northbound-express')
      expect(recompile).not.toHaveBeenCalled()
      expect(state.value).toBe('current')
      expect(error.value).toBeNull()
    })

    it('is publishing for the duration of the call', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService).mockResolvedValue(snapshot('2026-09-21T09:00:00Z'))
      const { check, publish, publishing, busy } = setup('2026-09-20T11:00:00Z')
      await check()
      const pending = publish()
      expect(publishing.value).toBe(true)
      expect(busy.value).toBe(true)
      await pending
      expect(publishing.value).toBe(false)
    })

    it('compiles and retries once when the compile is stale', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService)
        .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
        .mockResolvedValueOnce(snapshot('2026-09-21T09:00:00Z'))
      const { state, check, publish, recompile } = setup('2026-09-20T11:00:00Z')
      await check()
      await publish()
      expect(recompile).toHaveBeenCalledWith('northbound-express')
      expect(publishService).toHaveBeenCalledTimes(2)
      expect(state.value).toBe('current')
    })

    it('clears unpublished changes on a republish', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      vi.mocked(publishService)
        .mockRejectedValueOnce(new ApiError('stale', 409, 'stale_graph'))
        .mockResolvedValueOnce(snapshot('2026-09-22T09:00:00Z'))
      const { state, check, publish } = setup('2026-09-21T08:00:00Z')
      await check()
      expect(state.value).toBe('changed')
      await publish()
      expect(state.value).toBe('current')
    })

    it('does not publish, and says why, when the compile fails', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
      const { state, check, publish, error } = setup('2026-09-20T11:00:00Z', vi.fn().mockResolvedValue(false))
      await check()
      await publish()
      expect(publishService).toHaveBeenCalledTimes(1)
      expect(state.value).toBe('unpublished')
      expect(error.value).toBe(PUBLISH_COMPILE_FAILED)
    })

    it('gives up rather than looping when an edit lands during the compile', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService).mockRejectedValue(new ApiError('stale', 409, 'stale_graph'))
      const { state, check, publish, error, recompile } = setup('2026-09-20T11:00:00Z')
      await check()
      await publish()
      expect(recompile).toHaveBeenCalledTimes(1)
      expect(publishService).toHaveBeenCalledTimes(2)
      expect(state.value).toBe('unpublished')
      expect(error.value).toBe(PUBLISH_RACED_EDIT)
    })

    it('reports any other failure with its reason and leaves the earlier publication alone', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      vi.mocked(publishService).mockRejectedValue(new ApiError('PUT failed: 500: internal error', 500))
      const { state, check, publish, error, publishedAt, recompile } = setup('2026-09-21T08:00:00Z')
      await check()
      await publish()
      expect(recompile).not.toHaveBeenCalled()
      expect(error.value).toContain('500: internal error')
      expect(publishedAt.value).toBe(PUBLISHED_AT)
      expect(state.value).toBe('changed')
    })

    it('clears an earlier error once a publish goes through', async () => {
      vi.mocked(fetchServicePublication).mockRejectedValue(new ApiError('not found', 404))
      vi.mocked(publishService)
        .mockRejectedValueOnce(new ApiError('boom', 500))
        .mockResolvedValueOnce(snapshot('2026-09-21T09:00:00Z'))
      const { check, publish, error } = setup('2026-09-20T11:00:00Z')
      await check()
      await publish()
      expect(error.value).not.toBeNull()
      await publish()
      expect(error.value).toBeNull()
    })
  })

  describe('unpublish', () => {
    it('deletes the publication', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      vi.mocked(unpublishService).mockResolvedValue(undefined)
      const { state, check, unpublish } = setup('2026-09-20T11:00:00Z')
      await check()
      await unpublish()
      expect(unpublishService).toHaveBeenCalledWith('northbound-express')
      expect(state.value).toBe('unpublished')
    })

    it('stays published, and says why, when the delete fails', async () => {
      vi.mocked(fetchServicePublication).mockResolvedValue(snapshot() as ServicePublication)
      vi.mocked(unpublishService).mockRejectedValue(new ApiError('DELETE failed: 500', 500))
      const { state, check, unpublish, error } = setup('2026-09-20T11:00:00Z')
      await check()
      await unpublish()
      expect(state.value).toBe('current')
      expect(error.value).toContain('DELETE failed: 500')
    })
  })
})
