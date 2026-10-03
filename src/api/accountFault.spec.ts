// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './authoring/client'
import { WrongCurrentPasswordError } from './authoring/auth'
import { SESSION_EXPIRED_FAULT, UNREACHABLE_FAULT } from './authoringFault'
import { accountFault } from './accountFault'

function validation(faults: unknown[]): ApiError {
  return new ApiError('POST /api/auth/password failed: 422: refused', 422, 'validation', { faults })
}

describe('accountFault', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('names a wrong current password', () => {
    expect(accountFault(new WrongCurrentPasswordError())).toBe('Your current password is incorrect.')
  })

  it.each([
    ['min_length', 'Your new password must be at least 12 characters.'],
    ['max_length', 'Your new password is too long. Use at most 72 characters.'],
    ['matches_email', "Your new password can't be your email address."],
    ['common', 'That password is too common. Choose one that is harder to guess.'],
    ['required', 'Enter a new password.'],
  ])('words the %s password rule', (rule, sentence) => {
    expect(accountFault(validation([{ field: 'new_password', rule }]))).toBe(sentence)
  })

  it('states every rule a new password broke', () => {
    const err = validation([
      { field: 'new_password', rule: 'min_length' },
      { field: 'new_password', rule: 'common' },
    ])
    expect(accountFault(err)).toBe(
      'Your new password must be at least 12 characters. That password is too common. Choose one that is harder to guess.',
    )
  })

  it.each([
    ['required', 'Enter a name.'],
    ['max_length', 'Your name can be at most 80 characters.'],
  ])('words the %s name rule', (rule, sentence) => {
    expect(accountFault(validation([{ field: 'name', rule }]))).toBe(sentence)
  })

  it('falls back to a general refusal for a fault it has no words for', () => {
    expect(accountFault(validation([{ field: 'other', rule: 'odd' }]))).toBe(
      "That wasn't accepted. Check it and try again.",
    )
  })

  it('asks the user to sign in again when the account changed under the request', () => {
    expect(accountFault(new ApiError('POST /api/auth/password failed: 409', 409))).toBe(
      'Your account changed in another session. Sign in again, then try once more.',
    )
  })

  it('words an expired session and an unreachable server as the authoring pages do', () => {
    expect(accountFault(new ApiError('PATCH /api/auth/me failed: 401', 401))).toBe(SESSION_EXPIRED_FAULT)
    expect(accountFault(new TypeError('Failed to fetch'))).toBe(UNREACHABLE_FAULT)
  })
})
