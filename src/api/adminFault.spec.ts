// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { adminFault } from './adminFault'
import { ApiError } from './authoring/client'
import { GENERIC_AUTHORING_FAULT, SESSION_EXPIRED_FAULT } from './authoringFault'

describe('adminFault', () => {
  it('says an invite’s email is taken', () => {
    expect(adminFault(new ApiError('x', 409), 'invite')).toBe('An account with that email already exists.')
  })

  it('says an admin can’t change their own access', () => {
    expect(adminFault(new ApiError('x', 409), 'update')).toBe("You can't demote or disable your own account.")
  })

  it('says the account is gone', () => {
    expect(adminFault(new ApiError('x', 404), 'reset')).toBe('That account no longer exists.')
  })

  it('names a lost admin role and an expired session', () => {
    expect(adminFault(new ApiError('x', 403), 'unpublish')).toBe('Only an admin can do that.')
    expect(adminFault(new ApiError('x', 401), 'update')).toBe(SESSION_EXPIRED_FAULT)
  })

  it('treats a failure that never reached the API as unreachable', () => {
    expect(adminFault(new TypeError('Failed to fetch'), 'invite')).toBe("Couldn't reach the server. Try again.")
  })

  it('falls back to the generic fault', () => {
    expect(adminFault(new ApiError('x', 500), 'unpublish')).toBe(GENERIC_AUTHORING_FAULT)
  })
})
