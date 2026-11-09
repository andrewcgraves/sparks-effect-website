import { createPinia } from 'pinia'
import type { App } from 'vue'
import { setAuthTokenProvider, setUnauthorizedHandler } from '../api/authoring'
import { useAuthStore } from './auth'

export interface InstallStoresOptions {
  // Called after local auth state is cleared; the app uses it to send the user
  // to sign in, which keeps the stores free of the router.
  onSessionExpired?: () => void
  // For an app that must never act as the visitor — an embed another site
  // frames: no request carries the session, and none is restored.
  anonymous?: boolean
}

// Only a 401 for the token still in force expires the session: once the first
// of several concurrent 401s has signed out, the rest name a token that is
// already gone — as does a late 401 for a token since replaced by a sign-in.
export function installStores(app: App, options: InstallStoresOptions = {}): void {
  const pinia = createPinia()
  app.use(pinia)

  // Before the auth store exists: creating it reads the persisted session.
  if (options.anonymous) {
    setAuthTokenProvider(() => null)
    setUnauthorizedHandler(null)
    return
  }
  const auth = useAuthStore(pinia)
  setAuthTokenProvider(() => auth.token)
  setUnauthorizedHandler((sentToken) => {
    if (auth.token !== sentToken) return
    auth.expireSession()
    options.onSessionExpired?.()
  })
  void auth.restoreSession()
}
