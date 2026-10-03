import { createPinia } from 'pinia'
import type { App } from 'vue'
import { setAuthTokenProvider, setUnauthorizedHandler } from '../api/authoring'
import { useAuthStore } from './auth'

export interface InstallStoresOptions {
  // Called after local auth state is cleared; the app uses it to send the user
  // to sign in, which keeps the stores free of the router.
  onSessionExpired?: () => void
}

// Only a 401 for the token still in force expires the session: once the first
// of several concurrent 401s has signed out, the rest name a token that is
// already gone — as does a late 401 for a token since replaced by a sign-in.
export function installStores(app: App, options: InstallStoresOptions = {}): void {
  const pinia = createPinia()
  app.use(pinia)

  const auth = useAuthStore(pinia)
  setAuthTokenProvider(() => auth.token)
  setUnauthorizedHandler((sentToken) => {
    if (auth.token !== sentToken) return
    auth.expireSession()
    options.onSessionExpired?.()
  })
  void auth.restoreSession()
}
