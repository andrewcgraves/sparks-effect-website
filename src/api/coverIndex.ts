import { listCuratedScenarios } from './scenarios'
import { listPublishedServices } from './publishedIndex'

export type CoverSource = 'scenario' | 'service'

export interface CoverCard {
  kind: CoverSource
  slug: string
  name: string
  caption?: string
  to: string
}

export interface CoverIndex {
  cards: CoverCard[]
  unavailable: CoverSource[]
}

export class CoverIndexUnavailableError extends Error {
  readonly causes: unknown[]

  constructor(causes: unknown[]) {
    super('neither the curated scenarios nor the published services could be read')
    this.name = 'CoverIndexUnavailableError'
    this.causes = causes
  }
}

export async function fetchCoverIndex(): Promise<CoverIndex> {
  // Two endpoints, because a curated scenario and a published service are
  // different models (sparks-effect-api's README, "The published index"). One
  // failing degrades the page to the half that answered rather than emptying
  // it, but is reported in `unavailable` so the page can say which half is
  // missing — a dropped rejection would read as an empty list, which is how the
  // speculative fan-out this replaced hid its failures. Only when both fail is
  // there nothing to show, and that rejects.
  const [scenarios, services] = await Promise.allSettled([listCuratedScenarios(), listPublishedServices()])

  if (scenarios.status === 'rejected' && services.status === 'rejected') {
    throw new CoverIndexUnavailableError([scenarios.reason, services.reason])
  }

  const cards: CoverCard[] = []
  const unavailable: CoverSource[] = []

  if (scenarios.status === 'fulfilled') {
    for (const scenario of scenarios.value) {
      cards.push({
        kind: 'scenario',
        slug: scenario.slug,
        name: scenario.name,
        caption: scenario.description,
        to: `/scenario/${scenario.slug}`,
      })
    }
  } else {
    unavailable.push('scenario')
  }

  if (services.status === 'fulfilled') {
    // One page, the most recently published: the cover's request must not
    // grow with every service published. Paging past it is the services
    // page's job (SPA-202).
    for (const service of services.value.items) {
      // The subtext, not the description: the subtext is the one-line
      // descriptor a service shows under its name, while its description is a
      // few paragraphs of prose that belongs on its page, not on a card.
      cards.push({
        kind: 'service',
        slug: service.slug,
        name: service.name,
        caption: service.subtext,
        to: `/services/${service.slug}`,
      })
    }
  } else {
    unavailable.push('service')
  }

  return { cards, unavailable }
}
