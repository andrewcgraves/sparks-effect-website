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

export async function logout(): Promise<void> {
  await apiRequest<void>('/api/auth/logout', { method: 'POST' })
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}
