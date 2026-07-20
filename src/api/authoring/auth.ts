// Identity and session endpoints. There is no registration endpoint by
// design — accounts are provisioned by an admin via POST /api/admin/users.
import { apiRequest } from './client'

// The account behind the current bearer token.
export interface CurrentUser {
  id: string
  email?: string
  name?: string
  is_admin?: boolean
}

// The session minted by a successful login.
export interface LoginResponse {
  token: string
  expires_at: string
  user: CurrentUser
}

// Exchanges credentials for a bearer token. A 401 covers unknown email, wrong
// password, and no-password-set alike (the API avoids account enumeration).
export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

// Revokes the current session server-side.
export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

// Resolves who the current token belongs to; 401s once the session is gone.
export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}
