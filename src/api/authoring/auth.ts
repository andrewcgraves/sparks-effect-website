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
