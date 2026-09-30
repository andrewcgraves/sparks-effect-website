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
