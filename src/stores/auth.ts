// Shared auth state: the signed-in user and the token the API client sends.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

// localStorage key holding the persisted session so a reload stays signed in.
export const AUTH_STORAGE_KEY = 'sparks-effect.auth'

// The subset of the account the UI needs to render "signed in as ...".
export interface AuthUser {
  id: string
  email?: string
  name?: string
}

interface PersistedSession {
  token: string
  user: AuthUser | null
}

// Reads a previously persisted session, tolerating absent, corrupt, or partial data.
function readPersistedSession(): PersistedSession | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    // Storage disabled (private mode, blocked cookies); treat as signed out.
    return null
  }
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    // A session without a token can't authenticate anything, so discard it.
    if (typeof parsed?.token !== 'string' || !parsed.token) return null
    return { token: parsed.token, user: parsed.user ?? null }
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', () => {
  const persisted = readPersistedSession()
  const token = ref<string | null>(persisted?.token ?? null)
  const user = ref<AuthUser | null>(persisted?.user ?? null)

  // Mirrors readPersistedSession: an empty token authenticates nothing.
  const isAuthenticated = computed(() => Boolean(token.value))

  // Persistence is best-effort: a full or disabled store must not break sign-in.
  function persist(): void {
    try {
      if (!token.value) {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        return
      }
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ token: token.value, user: user.value }),
      )
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

  return { token, user, isAuthenticated, signIn, signOut }
})
