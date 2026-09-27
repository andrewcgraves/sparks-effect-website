import { computed, ref } from 'vue'
import { ApiError } from '../api/authoring/client'
import { fetchServicePublication, publishService, unpublishService } from '../api/publications'
import { latestAttempt } from './latestAttempt'

export type PublicationState = 'checking' | 'unknown' | 'unpublished' | 'current' | 'changed'

export const PUBLISH_COMPILE_FAILED = "Not published: this service didn't compile. The reason is shown with the map below."
export const PUBLISH_RACED_EDIT = 'Not published: this service changed while it was compiling. Try again.'

// Go and Postgres write sub-millisecond digits, which Date.parse is not
// required to accept. Milliseconds are plenty: a compile always sits between an
// edit and the publish that follows it.
export function instant(timestamp: string | undefined | null): number {
  if (!timestamp) return Number.NaN
  return Date.parse(timestamp.replace(/(\.\d{3})\d+/, '$1'))
}

function isStaleGraph(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'stale_graph'
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function usePublication(
  getSlug: () => string,
  getUpdatedAt: () => string | undefined,
  // Compiles through the page's own compile, so a fault lands where every other
  // compile fault on the page does. Resolves false when the compile failed.
  recompile: (slug: string) => Promise<boolean>,
) {
  const checking = ref(true)
  const checkFailed = ref(false)
  const publishedAt = ref<string | null>(null)
  const publishing = ref(false)
  const unpublishing = ref(false)
  const error = ref<string | null>(null)

  const checks = latestAttempt()

  // The owner reads the same public resource a visitor does: what matters here
  // is what the world sees, not the draft.
  async function check(): Promise<void> {
    const attempt = checks.begin()
    checking.value = true
    checkFailed.value = false
    try {
      const pub = await fetchServicePublication(getSlug())
      if (!checks.isCurrent(attempt)) return
      publishedAt.value = pub.published_at
    } catch (err) {
      if (!checks.isCurrent(attempt)) return
      if (err instanceof ApiError && err.status === 404) publishedAt.value = null
      else checkFailed.value = true
    } finally {
      if (checks.isCurrent(attempt)) checking.value = false
    }
  }

  // A draft edit — prose included — bumps updated_at, and a publication is a
  // snapshot, so any edit after publishing is invisible to visitors until a
  // republish. Unparseable timestamps compare false and read as current.
  const state = computed<PublicationState>(() => {
    if (checking.value) return 'checking'
    if (checkFailed.value) return 'unknown'
    if (!publishedAt.value) return 'unpublished'
    return instant(getUpdatedAt()) > instant(publishedAt.value) ? 'changed' : 'current'
  })

  const busy = computed(() => publishing.value || unpublishing.value)

  // Publishing pins the latest compile if it is still current, and refuses with
  // stale_graph otherwise (ADR-0005 in sparks-effect-api). The refusal's remedy
  // is to compile and try again — once: stale again straight after a clean
  // compile means an edit landed in between, which the owner should hear about
  // rather than have looped over.
  async function publish(): Promise<void> {
    if (busy.value) return
    const slug = getSlug()
    publishing.value = true
    error.value = null
    try {
      let pub
      try {
        pub = await publishService(slug)
      } catch (err) {
        if (!isStaleGraph(err)) throw err
        if (!(await recompile(slug))) {
          error.value = PUBLISH_COMPILE_FAILED
          return
        }
        pub = await publishService(slug)
      }
      publishedAt.value = pub.published_at
    } catch (err) {
      error.value = isStaleGraph(err) ? PUBLISH_RACED_EDIT : `Not published: ${reason(err)}`
    } finally {
      publishing.value = false
    }
  }

  async function unpublish(): Promise<void> {
    if (busy.value) return
    unpublishing.value = true
    error.value = null
    try {
      await unpublishService(getSlug())
      publishedAt.value = null
    } catch (err) {
      error.value = `Still published: ${reason(err)}`
    } finally {
      unpublishing.value = false
    }
  }

  return { state, publishedAt, publishing, unpublishing, busy, error, check, publish, unpublish }
}
