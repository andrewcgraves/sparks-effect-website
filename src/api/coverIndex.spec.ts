// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./scenarios', () => ({
  listCuratedScenarios: vi.fn(),
}))
vi.mock('./publications', () => ({
  listPublishedServices: vi.fn(),
}))

import { CoverIndexUnavailableError, fetchCoverIndex } from './coverIndex'
import { listCuratedScenarios } from './scenarios'
import { listPublishedServices } from './publications'

const caHsr = { slug: 'ca-hsr', name: 'CA HSR', description: 'California High-Speed Rail' }
const coastLine = {
  slug: 'coast-line',
  name: 'Coast Line',
  subtext: 'Electrified · Regional rail',
  description: 'Several paragraphs of prose.',
}

describe('fetchCoverIndex', () => {
  beforeEach(() => {
    vi.mocked(listCuratedScenarios).mockReset().mockResolvedValue([caHsr])
    vi.mocked(listPublishedServices).mockReset().mockResolvedValue({ items: [coastLine], next_cursor: null })
  })

  it('lists curated scenarios, then published services, each linking to its own page', async () => {
    const index = await fetchCoverIndex()

    expect(index.unavailable).toEqual([])
    expect(index.cards).toEqual([
      { kind: 'scenario', slug: 'ca-hsr', name: 'CA HSR', caption: 'California High-Speed Rail', to: '/scenario/ca-hsr' },
      { kind: 'service', slug: 'coast-line', name: 'Coast Line', caption: 'Electrified · Regional rail', to: '/services/coast-line' },
    ])
  })

  it('keeps the published order the index answered in', async () => {
    vi.mocked(listPublishedServices).mockResolvedValue({
      items: [
        { slug: 'newest', name: 'Newest' },
        { slug: 'older', name: 'Older' },
      ],
      next_cursor: null,
    })

    const index = await fetchCoverIndex()

    expect(index.cards.filter((card) => card.kind === 'service').map((card) => card.slug)).toEqual(['newest', 'older'])
  })

  it('reads only the first page of published services, however many follow', async () => {
    vi.mocked(listPublishedServices).mockResolvedValue({ items: [coastLine], next_cursor: 'more' })

    const index = await fetchCoverIndex()

    expect(listPublishedServices).toHaveBeenCalledTimes(1)
    expect(listPublishedServices).toHaveBeenCalledWith()
    expect(index.cards.filter((card) => card.kind === 'service').map((card) => card.slug)).toEqual(['coast-line'])
  })

  it('leaves a service with no subtext uncaptioned rather than falling back to its description', async () => {
    vi.mocked(listPublishedServices).mockResolvedValue({
      items: [{ slug: 'bare', name: 'Bare', description: 'Long prose.' }],
      next_cursor: null,
    })

    const index = await fetchCoverIndex()

    expect(index.cards.find((card) => card.kind === 'service')?.caption).toBeUndefined()
  })

  it('degrades to the curated scenarios when the published index fails, and says so', async () => {
    vi.mocked(listPublishedServices).mockRejectedValue(new Error('503'))

    const index = await fetchCoverIndex()

    expect(index.cards.map((card) => card.slug)).toEqual(['ca-hsr'])
    expect(index.unavailable).toEqual(['service'])
  })

  it('degrades to the published services when the curated list fails, and says so', async () => {
    vi.mocked(listCuratedScenarios).mockRejectedValue(new Error('500'))

    const index = await fetchCoverIndex()

    expect(index.cards.map((card) => card.slug)).toEqual(['coast-line'])
    expect(index.unavailable).toEqual(['scenario'])
  })

  it('rejects when neither read answers', async () => {
    vi.mocked(listCuratedScenarios).mockRejectedValue(new Error('500'))
    vi.mocked(listPublishedServices).mockRejectedValue(new Error('503'))

    await expect(fetchCoverIndex()).rejects.toBeInstanceOf(CoverIndexUnavailableError)
  })

  it('answers an empty index, with nothing unavailable, when both reads answer empty', async () => {
    vi.mocked(listCuratedScenarios).mockResolvedValue([])
    vi.mocked(listPublishedServices).mockResolvedValue({ items: [], next_cursor: null })

    expect(await fetchCoverIndex()).toEqual({ cards: [], unavailable: [] })
  })
})
