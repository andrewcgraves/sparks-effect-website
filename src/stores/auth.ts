// Shared auth state: the signed-in user and the token the API client sends.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, fetchCurrentUser, login as loginRequest, logout as logoutRequest, type CurrentUser } from '../api/authoring'
import { readJson, removeKey, writeJson } from './storage'

// localStorage key holding the persisted token so a reload stays signed in.
export const AUTH_STORAGE_KEY = 'sparks-effect.auth'

// The account the UI renders as "signed in as ...", straight from /api/auth/me.
export type AuthUser = CurrentUser

// The token, plus the id of the account it belongs to.
//
// The rest of the user record is deliberately not persisted: it comes back from
// /api/auth/me and never goes stale the way a cached copy would — notably
// is_admin, which gates admin-only UI. The id is the one exception, because it
// cannot go stale (a token belongs to one account for its whole life) and
// because state scoped per user — authoring drafts — has to know whose it is
// the moment the page boots, not whenever the network gets round to answering.
interface PersistedSession {
  token: string
  userId?: string
}

// Reads a previously persisted session, tolerating absent, corrupt, or partial data.
function readPersistedSession(): PersistedSession | null {
  const parsed = readJson<PersistedSession>(AUTH_STORAGE_KEY)
  // A session without a token can't authenticate anything, so discard it.
  if (typeof parsed?.token !== 'string' || !parsed.token) return null
  return {
    token: parsed.token,
    userId: typeof parsed.userId === 'string' && parsed.userId ? parsed.userId : undefined,
  }
}

export const useAuthStore = defineStore('auth', () => {
  const restored = readPersistedSession()

  const token = ref<string | null>(restored?.token ?? null)
  // Whose session this is, known without waiting on the network. Distinct from
  // `user`, which carries the full, freshly fetched record and stays null until
  // /api/auth/me answers — or forever, if it never does.
  const userId = ref<string | null>(restored?.userId ?? null)
  // Populated by restoreSession() on boot, or by signIn() at login.
  const user = ref<AuthUser | null>(null)

  // Mirrors readPersistedToken: an empty token authenticates nothing.
  const isAuthenticated = computed(() => Boolean(token.value))

  // Persistence is best-effort: a full or disabled store must not break sign-in.
  function persist(): void {
    if (!token.value) {
      removeKey(AUTH_STORAGE_KEY)
      return
    }
    const session: PersistedSession = { token: token.value }
    if (userId.value) session.userId = userId.value
    writeJson(AUTH_STORAGE_KEY, session)
  }

  function signIn(newToken: string, newUser: AuthUser | null = null): void {
    token.value = newToken
    userId.value = newUser?.id ?? null
    user.value = newUser
    persist()
  }

  function signOut(): void {
    token.value = null
    userId.value = null
    user.value = null
    persist()
  }

  // Exchanges credentials for a session. There is no signup UI — accounts
  // are provisioned by an admin. Leaves the store untouched on failure so
  // the caller's error (e.g. invalid credentials) is the only visible effect.
  async function login(email: string, password: string): Promise<void> {
    const session = await loginRequest(email, password)
    signIn(session.token, session.user)
  }

  // Revokes the session server-side, then signs out locally regardless of
  // whether revocation succeeded — an already-expired token can't be
  // revoked, but the user still expects to end up signed out.
  async function logout(): Promise<void> {
    try {
      await logoutRequest()
    } catch {
      // Token already invalid/expired server-side; sign out locally anyway.
    }
    signOut()
  }

  // Rehydrates the user behind a persisted token on boot.
  //
  // A 401 means the session was revoked or expired, so the stored token is
  // dead and we sign out. Any other failure (offline, API down) is treated as
  // transient: the token is kept so a later call can still succeed.
  async function restoreSession(): Promise<void> {
    if (!token.value) return
    try {
      const me = await fetchCurrentUser()
      user.value = me
      // Confirms whose session this is, and backfills it for sessions stored
      // before the id was kept alongside the token.
      if (userId.value !== me.id) {
        userId.value = me.id
        persist()
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) signOut()
    }
  }

  return { token, userId, user, isAuthenticated, signIn, signOut, login, logout, restoreSession }
})
