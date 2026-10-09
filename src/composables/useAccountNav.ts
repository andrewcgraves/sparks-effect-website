import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

export interface AccountLink {
  label: string
  path: string
  testId: string
}

export function useAccountNav() {
  const auth = useAuthStore()
  const router = useRouter()

  // Until /api/auth/me answers there is no name or email to show, so the
  // account control still says what it opens.
  const label = computed(() => auth.displayName ?? 'Account')

  const links = computed<AccountLink[]>(() => [
    { label: 'My authoring', path: '/authoring', testId: 'nav-authoring' },
    { label: 'Account', path: '/account', testId: 'nav-account' },
    ...(auth.user?.is_admin ? [{ label: 'Admin', path: '/admin', testId: 'nav-admin' }] : []),
  ])

  async function signOut(): Promise<void> {
    await auth.logout()
    await router.push('/')
  }

  return { label, links, signOut }
}
