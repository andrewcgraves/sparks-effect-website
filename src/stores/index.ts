// Public surface of the authoring stores.
import { createPinia } from 'pinia'
import type { App } from 'vue'
import { setAuthTokenProvider } from '../api/authoring'
import { useAuthStore } from './auth'

export * from './auth'
export * from './drafts'
export * from './jobs'

// Installs Pinia and points the API client at the auth store's token.
//
// A persisted token is rehydrated in the background: boot must not block on the
// network, and restoreSession() handles its own failures (401 signs out, anything
// else leaves the session alone).
export function installStores(app: App): void {
  const pinia = createPinia()
  app.use(pinia)

  const auth = useAuthStore(pinia)
  setAuthTokenProvider(() => auth.token)
  void auth.restoreSession()
}
