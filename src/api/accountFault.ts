import { ApiError } from './authoring/client'
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, WrongCurrentPasswordError } from './authoring/auth'
import { authoringFault } from './authoringFault'

const VALIDATION_ERROR_CODE = 'validation'
const REFUSED_FAULT = "That wasn't accepted. Check it and try again."

// Keyed field:rule. Unlike an authoring form, each field here has one input,
// so every rule a value broke is worth stating rather than one per field.
const FAULT_SENTENCES: Record<string, string> = {
  'name:required': 'Enter a name.',
  'name:max_length': `Your name can be at most ${NAME_MAX_LENGTH} characters.`,
  'new_password:required': 'Enter a new password.',
  'new_password:min_length': `Your new password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  'new_password:max_length': 'Your new password is too long. Use at most 72 characters.',
  'new_password:matches_email': "Your new password can't be your email address.",
  'new_password:common': 'That password is too common. Choose one that is harder to guess.',
}

function validationSentence(detail: unknown): string {
  const faults = (detail as { faults?: unknown } | null)?.faults
  if (!Array.isArray(faults)) return REFUSED_FAULT
  const sentences = faults
    .map((fault: { field?: unknown, rule?: unknown } | null) => FAULT_SENTENCES[`${fault?.field}:${fault?.rule}`])
    .filter((sentence): sentence is string => Boolean(sentence))
  return sentences.length ? [...new Set(sentences)].join(' ') : REFUSED_FAULT
}

function ownFault(err: unknown): string | null {
  if (err instanceof WrongCurrentPasswordError) return 'Your current password is incorrect.'
  if (!(err instanceof ApiError)) return null
  if (err.status === 422) return err.code === VALIDATION_ERROR_CODE ? validationSentence(err.detail) : REFUSED_FAULT
  if (err.status === 409) return 'Your account changed in another session. Sign in again, then try once more.'
  return null
}

export function accountFault(err: unknown): string {
  const own = ownFault(err)
  if (own === null) {
    // Expiry, rate limiting and an unreachable server read the same here as on
    // any authoring page, which also reports the error.
    return authoringFault(err)
  }
  console.error('[account]', err)
  return own
}
