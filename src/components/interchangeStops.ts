import type { Service, StopIdentity } from '../api/authoring/types'
import { REMOVED_STOP, UNNAMED_LINE, UNNAMED_STOP } from '../copy/names'

// A pair names its stops by slug alone, so it outlives a stop deleted from its
// line, and one set through the API can name a line this page has no record
// of. Either is still listed, rather than by the slug or id it was declared
// with, so the author can remove it — the compile refuses a pair naming a stop
// that is gone. A stop its line no longer has reads as removed; on a line this
// page has no record of there is nothing to check the stop against, so it is
// only unnamed, and not judged missing unless the line has left the network.
export function resolveStop(
  stop: StopIdentity,
  memberIds: string[],
  services: Pick<Service, 'id' | 'name' | 'stops'>[],
): { label: string; missing: boolean } {
  const service = services.find((candidate) => candidate.id === stop.service_id)
  const named = service?.stops.find((candidate) => candidate.slug === stop.slug)
  const stopName = named?.name ?? (service ? REMOVED_STOP : UNNAMED_STOP)
  return {
    label: `${stopName} (${service?.name ?? UNNAMED_LINE})`,
    missing: !memberIds.includes(stop.service_id) || Boolean(service && !named),
  }
}
