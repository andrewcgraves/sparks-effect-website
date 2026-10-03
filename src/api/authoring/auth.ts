import { apiRequest } from './client'

export interface CurrentUser {
  id: string
  email?: string
  name?: string
  is_admin?: boolean
}

export interface LoginResponse {
  token: string
  expires_at: string
  user: CurrentUser
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// An explicit token marks the request as not riding on the ambient session, so
// a 401 from an already-dead token is not mistaken for the session expiring.
export async function logout(token?: string): Promise<void> {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  await apiRequest<void>('/api/auth/logout', { method: 'POST', headers })
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}

export async function updateMe(name: string): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

// Mirrors of the API's own limits, for wording them; the API enforces them.
export const PASSWORD_MIN_LENGTH = 12
export const NAME_MAX_LENGTH = 80

export class WrongCurrentPasswordError extends Error {
  constructor() {
    super('current password is incorrect')
    this.name = 'WrongCurrentPasswordError'
  }
}

// The API answers a wrong current password with 401, the same status as a dead
// session. The explicit token keeps that 401 from signing the user out; the
// caller decides which of the two it was.
export async function changePassword(currentPassword: string, newPassword: string, token: string): Promise<void> {
  await apiRequest<void>('/api/auth/password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export async function revokeAllSessions(): Promise<void> {
  await apiRequest<void>('/api/auth/sessions/revoke-all', { method: 'POST' })
}

export type AccountTokenPurpose = 'invite' | 'reset'

export interface AccountToken {
  purpose: AccountTokenPurpose
  email: string
  expires_at: string
}

// A used, expired or unknown link, or one for a disabled account, all answer
// the same 404, so the page cannot tell them apart and should not try.
export async function fetchAccountToken(token: string): Promise<AccountToken> {
  return apiRequest<AccountToken>(`/api/auth/tokens/${encodeURIComponent(token)}`)
}

export async function redeemAccountToken(token: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>(`/api/auth/tokens/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}
