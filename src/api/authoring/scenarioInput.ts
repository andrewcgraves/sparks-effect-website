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

export function nearMissPair(nearMiss: NearMiss): InterchangePair {
  return {
    a: { service_id: nearMiss.a.service_id, slug: nearMiss.a.slug },
    b: { service_id: nearMiss.b.service_id, slug: nearMiss.b.slug },
  }
}

// Mirrors ParseBoardingWaitPolicy in sparks-effect-api: only `fixed` carries
// seconds, and it refuses a missing or negative value. JSON has no integer
// type, so a fraction is refused here before the API's int field does.
export function isValidBoardingWait(wait: BoardingWaitOverride | null): boolean {
  if (wait?.policy !== 'fixed') return true
  return wait.secs !== undefined && Number.isInteger(wait.secs) && wait.secs >= 0
}
