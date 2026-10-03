import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  changePassword as changePasswordRequest,
  fetchCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  revokeAllSessions,
  SessionExpiredError,
  updateMe,
  WrongCurrentPasswordError,
  type CurrentUser,
} from '../api/authoring'
import { readJson, removeKey, writeJson } from './storage'

export const AUTH_STORAGE_KEY = 'sparks-effect.auth'

export type AuthUser = CurrentUser

interface PersistedSession {
  token: string
  userId?: string
}

function readPersistedSession(): PersistedSession | null {
  const parsed = readJson<PersistedSession>(AUTH_STORAGE_KEY)
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
  const user = ref<AuthUser | null>(null)

  // Set when the session died under the user rather than being ended by them,
  // so the sign-in page can say why they are there. Cleared by the next sign-in.
  const sessionExpired = ref(false)

  const isAuthenticated = computed(() => Boolean(token.value))

  // The display name, once one is set; until then the email stands in.
  const displayName = computed(() => user.value?.name || user.value?.email || null)

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
    sessionExpired.value = false
    persist()
  }

  function signOut(): void {
    token.value = null
    userId.value = null
    user.value = null
    persist()
  }

  // Local only: the token is already dead, so there is nothing to revoke. Drafts
  // are untouched — their stored copy waits for the same user to sign back in.
  function expireSession(): void {
    signOut()
    sessionExpired.value = true
  }

  // There is no signup UI — accounts are provisioned by an admin. Leaves the
  // store untouched on failure so the caller's error (e.g. invalid credentials)
  // is the only visible effect.
  async function login(email: string, password: string): Promise<void> {
    const session = await loginRequest(email, password)
    signIn(session.token, session.user)
  }

  // Signs out locally first, then revokes; an already-expired token can't be
  // revoked, but the user still expects to end up signed out.
  async function logout(): Promise<void> {
    const endingToken = token.value
    signOut()
    if (!endingToken) return
    try {
      await logoutRequest(endingToken)
    } catch {
      // Token already invalid/expired server-side; nothing left to revoke.
    }
  }

  // Other devices are only signed out once the API confirms it, so a failed
  // revoke leaves this one signed in too rather than pretending it worked.
  async function logoutEverywhere(): Promise<void> {
    await revokeAllSessions()
    signOut()
  }

  async function updateName(name: string): Promise<void> {
    user.value = await updateMe(name)
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const sessionToken = token.value
    if (!sessionToken) throw new SessionExpiredError('no session to change the password of')
    try {
      await changePasswordRequest(currentPassword, newPassword, sessionToken)
    } catch (err: unknown) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err
      // The API gives a wrong current password and a dead session the same
      // 401. Asking who we are on the ambient session tells them apart: if the
      // session is gone, that request expires it through the usual path and
      // its error propagates from here instead.
      await fetchCurrentUser()
      throw new WrongCurrentPasswordError()
    }
  }

  // A 401 means the session was revoked or expired, so the stored token is
  // dead and we sign out. Any other failure (offline, API down) is treated as
  // transient: the token is kept so a later call can still succeed.
  //
  // Callers that ask while a restore is in flight share it: the router waits on
  // the one started at boot before deciding whether an admin page may open.
  let restoring: Promise<void> | null = null

  function restoreSession(): Promise<void> {
    restoring ??= fetchSession().finally(() => { restoring = null })
    return restoring
  }

  async function fetchSession(): Promise<void> {
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

  return {
    token,
    userId,
    user,
    isAuthenticated,
    displayName,
    sessionExpired,
    signIn,
    signOut,
    expireSession,
    login,
    logout,
    logoutEverywhere,
    updateName,
    changePassword,
    restoreSession,
  }
})
