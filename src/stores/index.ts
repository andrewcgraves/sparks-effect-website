import { createPinia } from 'pinia'
import type { App } from 'vue'
import { setAuthTokenProvider } from '../api/authoring'
import { useAuthStore } from './auth'

export * from './auth'
export * from './drafts'
export * from './jobs'

export function installStores(app: App): void {
  const pinia = createPinia()
  app.use(pinia)

  const auth = useAuthStore(pinia)
  setAuthTokenProvider(() => auth.token)
  void auth.restoreSession()
}
