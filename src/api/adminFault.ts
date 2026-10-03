import { ApiError } from './authoring/client'
import { GENERIC_AUTHORING_FAULT, SESSION_EXPIRED_FAULT } from './authoringFault'

export type AdminAction = 'invite' | 'update' | 'reset' | 'unpublish'

const CONFLICTS: Partial<Record<AdminAction, string>> = {
  invite: 'An account with that email already exists.',
  update: "You can't demote or disable your own account.",
}

const MISSING: Partial<Record<AdminAction, string>> = {
  update: 'That account no longer exists.',
  reset: 'That account no longer exists.',
}

export function adminFault(err: unknown, action: AdminAction): string {
  if (!(err instanceof ApiError)) return "Couldn't reach the server. Try again."
  if (err.status === 401) return SESSION_EXPIRED_FAULT
  if (err.status === 403) return 'Only an admin can do that.'
  if (err.status === 409 && CONFLICTS[action]) return CONFLICTS[action]
  if (err.status === 404 && MISSING[action]) return MISSING[action]
  if (err.status === 400 && action === 'invite') return 'Enter a valid email address.'
  return GENERIC_AUTHORING_FAULT
}
