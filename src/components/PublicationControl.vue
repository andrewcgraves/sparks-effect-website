<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfirm } from '../composables/useConfirm'
import { instant, usePublication } from '../composables/usePublication'
import { useToast } from '../composables/useToast'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './buttonStyles'

const props = defineProps<{
  slug: string
  updatedAt?: string
  compiling: boolean
  recompile: (slug: string) => Promise<boolean>
}>()

const { state, publishedAt, publishing, unpublishing, busy, error, check, publish, unpublish } = usePublication(
  () => props.slug,
  () => props.updatedAt,
  (slug) => props.recompile(slug),
)

watch(() => props.slug, () => { void check() }, { immediate: true })

// Publishing may compile, so it waits out a compile the page already has
// running rather than superseding it. Its own compile is exempt.
const publishDisabled = computed(() => busy.value || (props.compiling && !publishing.value))

const published = computed(() => state.value === 'current' || state.value === 'changed')

const publishedWhen = computed(() => {
  const at = instant(publishedAt.value)
  if (Number.isNaN(at)) return ''
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
})

const router = useRouter()
const publicPath = computed(() => router.resolve({ name: 'published-service', params: { slug: props.slug } }).href)
const publicUrl = computed(() => new URL(publicPath.value, window.location.origin).href)

const copied = ref(false)
const copyFailed = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function copyPublicUrl(): Promise<void> {
  copyFailed.value = false
  try {
    // navigator.clipboard is missing outside a secure context; reading
    // writeText off it throws here, and lands in the same fallback.
    await navigator.clipboard.writeText(publicUrl.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    copyFailed.value = true
  }
}

onBeforeUnmount(() => clearTimeout(copiedTimer))

const { confirm } = useConfirm()
const { show: toast } = useToast()

const section = ref<HTMLElement | null>(null)

// The button pressed is disabled while it works and gone once it succeeds, so
// focus that fell to the body lands on whichever control now leads: "Copy
// link" once published, "Publish" once not.
async function refocus(): Promise<void> {
  await nextTick()
  if (document.activeElement && document.activeElement !== document.body) return
  section.value?.querySelector<HTMLElement>('[data-testid="copy-public-url"], [data-testid="publish-button"]')?.focus()
}

async function publishAndToast(): Promise<void> {
  const republishing = state.value === 'changed'
  if (await publish()) toast(republishing ? 'Republished' : 'Published')
  await refocus()
}

// Unpublishing breaks a URL that may already have been shared, so it takes a
// second, deliberate click.
async function confirmUnpublish(): Promise<void> {
  const confirmed = await confirm({
    title: 'Unpublish this service?',
    body: "Its public link will stop working for anyone you've shared it with, and stays broken until you publish again.",
    confirmLabel: 'Unpublish',
    cancelLabel: 'Keep published',
    destructive: true,
  })
  if (!confirmed) return
  if (await unpublish()) toast('Unpublished')
  await refocus()
}
</script>

<template>
  <section
    ref="section"
    class="mt-6 max-w-[720px] rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="publication"
    :data-state="state"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Publication
    </h2>

    <p
      v-if="state === 'checking'"
      class="font-body text-caption mt-3 text-ink-muted italic"
    >
      Checking whether this service is published…
    </p>

    <p
      v-else-if="state === 'unknown'"
      class="font-body text-caption mt-3 text-error"
      role="alert"
      data-testid="publication-check-error"
    >
      Couldn't check whether this service is published. Reload to try again.
    </p>

    <template v-else>
      <p
        class="font-body text-caption mt-3 text-ink"
        data-testid="publication-status"
      >
        <template v-if="state === 'unpublished'">
          Not published. Only you can see this service.
        </template>
        <template v-else>
          Published <time :datetime="publishedAt ?? undefined">{{ publishedWhen }}</time>.
          <template v-if="state === 'current'">
            Visitors see this service as it is now.
          </template>
          <strong
            v-else
            class="font-normal text-error"
            data-testid="publication-unpublished-changes"
          >
            You've edited this service since. Visitors still see the version you published, and won't see
            your changes until you republish.
          </strong>
        </template>
      </p>

      <div
        v-if="published"
        class="mt-3 flex flex-wrap items-center gap-3"
      >
        <a
          :href="publicPath"
          target="_blank"
          rel="noopener"
          class="font-body text-caption break-all text-ink underline hover:text-coral"
          data-testid="public-url"
        >{{ publicUrl }}</a>
        <button
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          data-testid="copy-public-url"
          @click="copyPublicUrl"
        >
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
      </div>
      <p
        v-if="copyFailed"
        class="font-body text-caption mt-2 text-ink-muted"
        role="status"
        data-testid="copy-public-url-failed"
      >
        Couldn't copy the link. Select it above and copy it yourself.
      </p>

      <div class="mt-4 flex flex-wrap gap-3">
        <button
          v-if="state !== 'current'"
          type="button"
          :class="PRIMARY_BUTTON_CLASS"
          :disabled="publishDisabled"
          data-testid="publish-button"
          @click="publishAndToast"
        >
          {{ publishing ? 'Publishing…' : state === 'changed' ? 'Republish' : 'Publish' }}
        </button>
        <button
          v-if="published"
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          :disabled="busy"
          data-testid="unpublish-button"
          @click="confirmUnpublish"
        >
          {{ unpublishing ? 'Unpublishing…' : 'Unpublish' }}
        </button>
      </div>

      <p
        v-if="error"
        class="font-body text-caption mt-3 text-error"
        role="alert"
        data-testid="publication-error"
      >
        {{ error }}
      </p>
    </template>
  </section>
</template>
