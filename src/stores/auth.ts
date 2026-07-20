// Shared auth state: the signed-in user and the token the API client sends.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, fetchCurrentUser, type CurrentUser } from '../api/authoring'

// localStorage key holding the persisted token so a reload stays signed in.
export const AUTH_STORAGE_KEY = 'sparks-effect.auth'

// The account the UI renders as "signed in as ...", straight from /api/auth/me.
export type AuthUser = CurrentUser

// Only the token is persisted: it alone can't be re-derived. Everything about
// the user comes back from /api/auth/me, which never goes stale the way a
// cached copy would — notably is_admin, which gates admin-only UI.
interface PersistedSession {
  token: string
}

// Reads a previously persisted token, tolerating absent, corrupt, or partial data.
function readPersistedToken(): string | null {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    // Storage disabled (private mode, blocked cookies); treat as signed out.
    return null
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    // A session without a token can't authenticate anything, so discard it.
    if (typeof parsed?.token !== 'string' || !parsed.token) return null
    return parsed.token
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(readPersistedToken())
  // Populated by restoreSession() on boot, or by signIn() at login.
  const user = ref<AuthUser | null>(null)

  // Mirrors readPersistedToken: an empty token authenticates nothing.
  const isAuthenticated = computed(() => Boolean(token.value))

  // Persistence is best-effort: a full or disabled store must not break sign-in.
  function persist(): void {
    try {
      if (!token.value) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
        return
      }
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: token.value }))
    } catch {
      // Session stays valid in memory for this tab.
    }
  }

  function signIn(newToken: string, newUser: AuthUser | null = null): void {
    token.value = newToken
    user.value = newUser
    persist()
  }

  function signOut(): void {
    token.value = null
    user.value = null
    persist()
  }

  // Rehydrates the user behind a persisted token on boot.
  //
  // A 401 means the session was revoked or expired, so the stored token is
  // dead and we sign out. Any other failure (offline, API down) is treated as
  // transient: the token is kept so a later call can still succeed.
  async function restoreSession(): Promise<void> {
    if (!token.value) return
    try {
      user.value = await fetchCurrentUser()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) signOut()
    }
  }

  return { token, user, isAuthenticated, signIn, signOut, restoreSession }
})
