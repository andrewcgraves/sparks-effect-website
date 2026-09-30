import { ApiError, STOP_PLACEMENT_ERROR_CODE, stopPlacementFault } from './authoring/client'
import type { StopPlacementFault } from './authoring/types'
import { JobFailedError } from './polling'

export type AuthoringNoun = 'service' | 'scenario'

export const GENERIC_AUTHORING_FAULT = 'Something went wrong. Please try again.'
export const SESSION_EXPIRED_FAULT = 'Your session has expired. Sign in again to carry on.'
export const UNREACHABLE_FAULT = "Couldn't reach the server. Your draft is saved; try again."

const COMPILE_ADVICE: Record<AuthoringNoun, string> = {
  service: 'Check its stops and timetable, then try again.',
  scenario: 'Check its services and interchanges, then try again.',
}

const VALIDATION_ERROR_CODE = 'validation'
const STALE_GRAPH_CODE = 'stale_graph'

interface ValidationFault {
  field: string
  index?: number
  rule: string
}

const ENTRY_NOUNS: Record<string, string> = {
  frequency_windows: 'Frequency window',
  stops: 'Stop',
  segments: 'Segment',
  coordinates: 'Point',
  service_ids: 'Service',
  interchange_pairs: 'Interchange',
}

const WHOLE_FIELDS: Record<string, string> = {
  name: 'Name',
  subtext: 'Subtext',
  description: 'Description',
  slug: 'Slug',
  route_id: 'Route',
  mode: 'Mode',
  type: 'Geometry type',
  coordinates: 'The alignment',
  segments: 'Segments',
  stops: 'Stops',
  frequency_windows: 'Frequency windows',
  service_ids: 'Services',
  interchange_pairs: 'Interchanges',
  'vehicle.max_speed_kmh': 'Top speed',
  'vehicle.acceleration_ms2': 'Acceleration',
  'vehicle.deceleration_ms2': 'Deceleration',
  'vehicle.dwell_s': 'Dwell time',
}

const MEMBER_WORDS: Record<string, string> = {
  headway_s: 'headway',
  start_time: 'start time',
  end_time: 'end time',
  name: 'name',
  lat: 'latitude',
  lng: 'longitude',
  grade_pct: 'grade',
  curve_radius_m: 'curve radius',
  cant_mm: 'cant',
  a: 'first service',
  b: 'second service',
}

const RULE_PHRASES: Record<string, string> = {
  required: 'is required',
  max_length: 'is too long',
  positive: 'must be more than zero',
  non_negative: "can't be negative",
  range: 'is out of range',
  min_count: 'has too few entries',
  count: 'has the wrong number of entries',
  duplicate: 'appears more than once',
  unknown: "isn't one we recognise",
  format: "isn't in the right format",
  type: 'is the wrong kind',
  zero_length: 'has no length',
  same_service: 'joins a service to itself',
  not_member: "isn't part of this scenario",
}

const PLURAL_FIELDS = new Set([
  'segments',
  'stops',
  'frequency_windows',
  'service_ids',
  'interchange_pairs',
])

const WHOLE_SENTENCES: Record<string, string> = {
  'stops:min_count': 'A service needs at least two stops.',
  'coordinates:min_count': 'The alignment needs at least two points.',
}

const PLURAL_VERBS: Record<string, string> = {
  is: 'are',
  has: 'have',
  "isn't": "aren't",
  appears: 'appear',
  joins: 'join',
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function plainWords(segment: string): string {
  // A field this build has no word for still reads better with its unit
  // suffix and underscores gone than as the raw path.
  return segment.replace(/_(s|m|mm|kmh|ms2|pct)$/, '').replace(/_/g, ' ')
}

function fieldLabel({ field, index }: ValidationFault): string {
  const [head, ...rest] = field.split('.')
  const member = rest.join('.')
  const memberWord = member ? (MEMBER_WORDS[member] ?? plainWords(member)) : ''

  // The API counts entries from zero; the forms number them from one.
  if (index !== undefined) {
    const entry = `${ENTRY_NOUNS[head] ?? capitalise(plainWords(head))} ${index + 1}`
    return memberWord ? `${entry}: ${memberWord}` : entry
  }
  return WHOLE_FIELDS[field] ?? capitalise(memberWord || plainWords(head))
}

function faultSentence(fault: ValidationFault): string {
  const whole = fault.index === undefined ? WHOLE_SENTENCES[`${fault.field}:${fault.rule}`] : undefined
  if (whole) return whole

  let phrase = RULE_PHRASES[fault.rule] ?? "isn't valid"
  // "Segments has too few entries" reads as a slip; a whole list takes a
  // plural verb, while one numbered entry of it does not.
  if (fault.index === undefined && PLURAL_FIELDS.has(fault.field)) {
    const [verb, ...rest] = phrase.split(' ')
    phrase = [PLURAL_VERBS[verb] ?? verb, ...rest].join(' ')
  }
  return `${fieldLabel(fault)} ${phrase}.`
}

function isValidationFault(value: unknown): value is ValidationFault {
  const fault = value as Partial<ValidationFault> | null
  return (
    typeof fault?.field === 'string' &&
    typeof fault.rule === 'string' &&
    (fault.index === undefined || typeof fault.index === 'number')
  )
}

function validationSentence(detail: unknown): string | null {
  const faults = (detail as { faults?: unknown } | null)?.faults
  if (!Array.isArray(faults)) return null

  // One sentence per field: two windows with the same bad headway are one
  // problem to fix, and the summary line is not the place to list every row.
  const seen = new Set<string>()
  const sentences: string[] = []
  for (const fault of faults.filter(isValidationFault)) {
    if (seen.has(fault.field)) continue
    seen.add(fault.field)
    sentences.push(faultSentence(fault))
  }
  return sentences.length ? sentences.join(' ') : null
}

function stopPlacementSentence(fault: StopPlacementFault | null): string {
  // The rows already carry the per-stop detail; this is the line above them.
  const [first, second] = fault?.stops ?? []
  if (fault?.fault === 'off_route' && first) {
    return `Stop "${first.name}" is too far from the route. Move it onto the line and save again.`
  }
  if (fault?.fault === 'chainage_order' && first && second) {
    return `Stops "${first.name}" and "${second.name}" are out of order along the route. Reorder them and save again.`
  }
  return "Some stops don't sit on the route. Check the flagged stops and save again."
}

function retryAfterSentence(seconds: number | undefined): string {
  if (seconds === undefined) return "You're going a little fast. Wait a moment, then try again."
  const wait = seconds === 1 ? '1 second' : `${seconds} seconds`
  return `You're going a little fast. Try again in ${wait}.`
}

function apiFault(err: ApiError, noun: AuthoringNoun): string {
  if (err.status === 401) return SESSION_EXPIRED_FAULT
  if (err.status === 403 || err.status === 404) return `This ${noun} no longer exists or isn't yours.`
  if (err.status === 409 && err.code === STALE_GRAPH_CODE) {
    return `This ${noun} changed since it was last compiled. Compile it again, then retry.`
  }
  if (err.status === 422 && err.code === STOP_PLACEMENT_ERROR_CODE) {
    return stopPlacementSentence(stopPlacementFault(err))
  }
  if (err.status === 422) {
    return (
      (err.code === VALIDATION_ERROR_CODE ? validationSentence(err.detail) : null) ??
      `Some of this ${noun}'s details weren't accepted. Check them and try again.`
    )
  }
  if (err.status === 429) return retryAfterSentence(err.retryAfterS)
  if (err.status >= 500) return UNREACHABLE_FAULT
  return GENERIC_AUTHORING_FAULT
}

function report(err: unknown): void {
  // Until the error-tracking ticket (M1) lands a real sink, the raw message
  // goes to the console: it is for whoever debugs this, never for the page.
  console.error('[authoring]', err)
}

export function authoringFault(err: unknown, noun: AuthoringNoun = 'service'): string {
  report(err)
  if (err instanceof ApiError) return apiFault(err, noun)
  if (err instanceof JobFailedError) return `This ${noun} couldn't be compiled. ${COMPILE_ADVICE[noun]}`
  // fetch rejects with a TypeError when the request never got an answer.
  if (err instanceof TypeError) return UNREACHABLE_FAULT
  return GENERIC_AUTHORING_FAULT
}
