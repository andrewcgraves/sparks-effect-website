import { onScopeDispose, readonly, ref, type Ref } from 'vue'

// Tailwind's `md` (48rem): the width below which a map page gives the screen
// to the map and moves its controls into the tabbed panel.
export const PHONE_MEDIA_QUERY = '(max-width: 47.99rem)'

export function useIsPhone(): Readonly<Ref<boolean>> {
  // jsdom and happy-dom's older builds have no matchMedia; a page that cannot
  // ask keeps the desktop layout, which is what every existing spec expects.
  const query = window.matchMedia?.(PHONE_MEDIA_QUERY)
  const isPhone = ref(query?.matches ?? false)

  function onChange(event: MediaQueryListEvent): void {
    isPhone.value = event.matches
  }

  query?.addEventListener('change', onChange)
  onScopeDispose(() => query?.removeEventListener('change', onChange))

  return readonly(isPhone)
}
