<script setup lang="ts">
import { ref } from 'vue'
import { listPublishedServices, type PublishedServiceSummary } from '../api/publishedIndex'
import { unpublishService } from '../api/publications'
import { adminFault } from '../api/adminFault'
import { isSessionExpiry } from '../api/authoring/client'
import { useConfirm } from '../composables/useConfirm'
import { useToast } from '../composables/useToast'
import { DESTRUCTIVE_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { ACTION_LINK_CLASS } from './linkStyles'

const PAGE_SIZE = 100

const { confirmWithNote } = useConfirm()
const { show: toast } = useToast()

const services = ref<PublishedServiceSummary[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const loadFailed = ref(false)
const busySlug = ref<string | null>(null)

// Always from the first page: after an unpublish the cursor of a page already
// read may point past a card that has since moved.
async function load(): Promise<void> {
  try {
    const page = await listPublishedServices({ limit: PAGE_SIZE })
    services.value = page.items
    nextCursor.value = page.next_cursor
    loadFailed.value = false
  } catch (err: unknown) {
    if (isSessionExpiry(err)) return
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

void load()

async function loadMore(): Promise<void> {
  if (!nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await listPublishedServices({ cursor: nextCursor.value, limit: PAGE_SIZE })
    services.value = [...services.value, ...page.items]
    nextCursor.value = page.next_cursor
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) toast("Couldn't load more services.", { kind: 'error' })
  } finally {
    loadingMore.value = false
  }
}

async function unpublish(service: PublishedServiceSummary): Promise<void> {
  const reason = await confirmWithNote({
    title: `Unpublish ${service.name}?`,
    body: `Its public page at /services/${service.slug} stops working for everyone, and any link already shared breaks. The owner keeps the draft and can publish it again.`,
    confirmLabel: 'Unpublish',
    noteLabel: 'Reason (logged)',
    destructive: true,
  })
  if (reason === null) return
  busySlug.value = service.slug
  try {
    await unpublishService(service.slug)
    // Logged in the browser until takedowns have somewhere to be recorded
    // (SPA-421).
    console.info('[admin] unpublished a service', { slug: service.slug, reason })
    toast(`${service.name} is unpublished`)
    await load()
  } catch (err: unknown) {
    if (!isSessionExpiry(err)) toast(adminFault(err, 'unpublish'), { kind: 'error' })
  } finally {
    busySlug.value = null
  }
}
</script>

<template>
  <section aria-labelledby="published-heading">
    <h2
      id="published-heading"
      class="font-display text-h2 text-ink-true"
    >
      Published services
    </h2>

    <p
      v-if="loading"
      class="font-body text-caption mt-4 text-ink-muted italic"
    >
      Loading…
    </p>
    <p
      v-else-if="loadFailed && services.length === 0"
      class="font-body text-caption mt-4 text-error"
      role="alert"
      data-testid="published-error"
    >
      Couldn't load the published services.
    </p>
    <p
      v-else-if="services.length === 0"
      class="font-body text-caption mt-4 text-ink-muted italic"
      data-testid="published-empty"
    >
      Nothing is published.
    </p>
    <template v-else>
      <ul class="mt-4 flex flex-col">
        <li
          v-for="service in services"
          :key="service.slug"
          class="flex flex-wrap items-center justify-between gap-3 border-t border-border py-2"
          :data-testid="`published-row-${service.slug}`"
        >
          <div class="font-body text-caption flex min-w-0 flex-col text-ink">
            {{ service.name }}
            <span class="text-micro break-all text-ink-muted">{{ service.slug }}</span>
          </div>
          <div class="flex items-center gap-3">
            <RouterLink
              :to="{ name: 'published-service', params: { slug: service.slug } }"
              :class="ACTION_LINK_CLASS"
              data-testid="open-published"
            >
              Open
            </RouterLink>
            <button
              type="button"
              :class="DESTRUCTIVE_BUTTON_CLASS"
              :disabled="busySlug === service.slug"
              data-testid="unpublish"
              @click="unpublish(service)"
            >
              Unpublish
            </button>
          </div>
        </li>
      </ul>
      <button
        v-if="nextCursor"
        type="button"
        :class="[SECONDARY_BUTTON_CLASS, 'mt-4']"
        :disabled="loadingMore"
        data-testid="published-more"
        @click="loadMore"
      >
        Load more
      </button>
    </template>
  </section>
</template>
