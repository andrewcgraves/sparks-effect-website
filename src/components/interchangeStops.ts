import type { Service, StopIdentity } from '../api/authoring/types'
import { UNNAMED_LINE, UNNAMED_STOP } from '../copy/names'

// A pair names its stops by slug alone, so it outlives a stop deleted from its
// line, and one set through the API can name a line this page has no record
// of. Either is still listed, under a neutral name rather than the slug or id
// it was declared with, so the author can remove it — the compile refuses a
// pair naming a stop that is gone. A line this page has no record of is not judged missing unless it
// has left the network: there is nothing to check its stops against.
export function resolveStop(
  stop: StopIdentity,
  memberIds: string[],
  services: Pick<Service, 'id' | 'name' | 'stops'>[],
): { label: string; missing: boolean } {
  const service = services.find((candidate) => candidate.id === stop.service_id)
  const named = service?.stops.find((candidate) => candidate.slug === stop.slug)
  return {
    label: `${named?.name ?? UNNAMED_STOP} (${service?.name ?? UNNAMED_LINE})`,
    missing: !memberIds.includes(stop.service_id) || Boolean(service && !named),
  }
}
