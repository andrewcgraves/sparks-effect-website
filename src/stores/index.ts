// Public surface of the authoring stores.
import { createPinia } from 'pinia'
import type { App } from 'vue'
import { setAuthTokenProvider } from '../api/authoring'
import { useAuthStore } from './auth'

export * from './auth'
export * from './drafts'
export * from './jobs'

// Installs Pinia and points the API client at the auth store's token.
export function installStores(app: App): void {
  const pinia = createPinia()
  app.use(pinia)
  setAuthTokenProvider(() => useAuthStore(pinia).token)
}
