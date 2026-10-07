import { AUTHORING_NOUN_WORDS, capitalise, type AuthoringNoun } from '../api/authoringFault'
import type { ChainResponse } from '../fixtures/isochrone'

export const PLOTTING_SPLASH_ZONE = 'Plotting splash zone…'

export function compilingMessage(noun: AuthoringNoun): string {
  return `Compiling ${AUTHORING_NOUN_WORDS[noun]}…`
}

export function compiledMessage(noun: AuthoringNoun): string {
  return `${capitalise(AUTHORING_NOUN_WORDS[noun])} compiled`
}

export function splashZoneReadyMessage(data: ChainResponse): string {
  // A chain missing its metadata still drew a splash zone; it just can't say
  // what the zone reaches.
  const count = data.metadata?.reachable_stations?.length ?? 0
  const reached = count === 0 ? 'no stations' : count === 1 ? '1 station' : `${count} stations`
  return `Splash zone ready: ${reached} reached`
}
