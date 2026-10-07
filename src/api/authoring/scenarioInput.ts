import type {
  BoardingWaitOverride,
  InterchangePair,
  NearMiss,
  Scenario,
  ScenarioInput,
  StopIdentity,
} from './types'

// Every write of a scenario starts here, so a field the form does not show
// still goes back exactly as it came: a PUT without interchange_pairs clears
// them, which is how SPA-403's edit used to lose pairs set through the API.
export function scenarioInput(scenario: Scenario): ScenarioInput {
  return {
    name: scenario.name,
    description: scenario.description,
    service_ids: [...scenario.service_ids],
    interchange_pairs: (scenario.interchange_pairs ?? []).map((pair) => ({ a: { ...pair.a }, b: { ...pair.b } })),
    boarding_wait: scenario.boarding_wait ? { ...scenario.boarding_wait } : null,
  }
}

function sameStop(x: StopIdentity, y: StopIdentity): boolean {
  return x.service_id === y.service_id && x.slug === y.slug
}

// A pair is unordered: the API folds a with b, so b-with-a is the same join.
export function sameInterchangePair(p: InterchangePair, q: InterchangePair): boolean {
  return (sameStop(p.a, q.a) && sameStop(p.b, q.b)) || (sameStop(p.a, q.b) && sameStop(p.b, q.a))
}

export function hasInterchangePair(pairs: InterchangePair[], pair: InterchangePair): boolean {
  return pairs.some((declared) => sameInterchangePair(declared, pair))
}

// The API refuses a pair naming a line outside the network (not_member), and
// deleting a line drops its membership but leaves its pairs behind, so every
// write keeps only the pairs whose lines are both still members.
export function namesMembers(pair: InterchangePair, memberIds: string[]): boolean {
  return memberIds.includes(pair.a.service_id) && memberIds.includes(pair.b.service_id)
}

export function interchangePairKey(pair: InterchangePair): string {
  return `${pair.a.service_id}/${pair.a.slug}|${pair.b.service_id}/${pair.b.slug}`
}

export function nearMissPair(nearMiss: NearMiss): InterchangePair {
  return {
    a: { service_id: nearMiss.a.service_id, slug: nearMiss.a.slug },
    b: { service_id: nearMiss.b.service_id, slug: nearMiss.b.slug },
  }
}

// Mirrors ParseBoardingWaitPolicy in sparks-effect-api: only `fixed` carries
// seconds, and it refuses a missing or negative value. JSON has no integer
// type, so a fraction is refused here before the API's int field does, and the
// column is an int4, so anything past its top is refused before Postgres does.
export const MAX_BOARDING_WAIT_SECS = 2147483647

export function isValidBoardingWait(wait: BoardingWaitOverride | null): boolean {
  if (wait?.policy !== 'fixed') return true
  return wait.secs !== undefined && Number.isInteger(wait.secs) && wait.secs >= 0 && wait.secs <= MAX_BOARDING_WAIT_SECS
}
