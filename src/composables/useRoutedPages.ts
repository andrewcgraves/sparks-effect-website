import { computed, type ComputedRef } from 'vue'
import { useRouter } from 'vue-router'

export interface SitePage {
  label: string
  path: string
}

export function useRoutedPages(pages: readonly SitePage[]) {
  const router = useRouter()
  // Each page is linked only once its route lands, so site navigation can ship
  // ahead of the pages it points to.
  return computed(() => {
    const paths = new Set(router.getRoutes().map((route) => route.path))
    return pages.filter((page) => paths.has(page.path))
  })
}

// The same rule for one page mentioned in prose: the sentence linking it
// appears only once there is a page to link.
export function useRoutedPath(path: string): ComputedRef<boolean> {
  const router = useRouter()
  return computed(() => router.getRoutes().some((route) => route.path === path))
}
