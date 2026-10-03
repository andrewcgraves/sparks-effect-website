import { apiRequest } from './authoring/client'
import type { CurrentUser } from './authoring/auth'

export interface AdminUser {
  id: string
  email: string
  name: string
  is_admin: boolean
  created_at: string
  disabled_at: string | null
  service_count: number
  published_count: number
}

export interface UserChange {
  is_admin?: boolean
  disabled?: boolean
}

export interface InviteRequest {
  email: string
  name: string
  is_admin: boolean
}

export interface Invite {
  user: CurrentUser
  url: string
}

export interface ResetLink {
  url: string
}

// Neither answer carries its link's expiry; these are the API's fixed lifetimes
// (sparks-effect-api README, "Invite and reset links").
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
export const RESET_LIFETIME_MS = 60 * 60 * 1000

export async function listUsers(): Promise<AdminUser[]> {
  return apiRequest<AdminUser[]>('/api/admin/users')
}

// The API refuses an admin demoting or disabling themselves with 409.
export async function updateUser(id: string, change: UserChange): Promise<CurrentUser> {
  return apiRequest<CurrentUser>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(change),
  })
}

export async function createInvite(invite: InviteRequest): Promise<Invite> {
  return apiRequest<Invite>('/api/admin/invites', { method: 'POST', body: JSON.stringify(invite) })
}

// Revokes the account's earlier unused reset link.
export async function createResetLink(id: string): Promise<ResetLink> {
  return apiRequest<ResetLink>(`/api/admin/users/${encodeURIComponent(id)}/reset-link`, { method: 'POST' })
}
