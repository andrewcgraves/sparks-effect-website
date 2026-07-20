// Identity endpoint for the signed-in session.
import { apiRequest } from './client'

// The account behind the current bearer token.
export interface CurrentUser {
  id: string
  email?: string
  name?: string
  is_admin?: boolean
}

// Resolves who the current token belongs to; 401s once the session is gone.
export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>('/api/auth/me')
}
