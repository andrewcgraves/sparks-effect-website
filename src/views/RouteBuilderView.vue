<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'
import { ROUTE_MODES } from '../api/authoring/types'
import { usePageTitle } from '../composables/usePageTitle'
import { useRouteDeletion } from '../composables/useDeletion'
import { useRouteDraft } from '../composables/useRouteDraft'
import { useToast } from '../composables/useToast'
import { formatKm } from '../routeGeometry'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import DeleteMenu from '../components/DeleteMenu.vue'
import MapView from '../components/MapView.vue'
import PageSkeleton from '../components/PageSkeleton.vue'
import { AUTHORING_CRUMB, type Crumb } from '../components/crumbs'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

// One view for both writes, as with lines: the form, the import and the map
// are the same whichever way a draft is headed; only the heading, the
// button and where a create ends up differ.
const props = defineProps<{ slug?: string }>()

const router = useRouter()
const route = useRoute()
const { show: toast } = useToast()

const {
  name,
  mode,
  bidirectional,
  description,
  importGeoJson,
  importError,
  importNote,
  touchName,
  editing,
  ready,
  loading,
  editNotFound,
  editLoadFailed,
  geometryLocked,
  geometryLockMessage,
  pointCount,
  lengthM,
  validationMessage,
  hasChanges,
  canSave,
  submitting,
  submitError,
  createdSlug,
  savedCount,
  mapRoutes,
  start,
  submit,
} = useRouteDraft(props.slug)

// Named after the route as saved, not the name field: the tab should not
// rename itself on every keystroke.
usePageTitle(() => (editing.value ? `Edit ${editing.value.name}` : null))

const trail = computed<Crumb[]>(() => [
  AUTHORING_CRUMB,
  ...(props.slug
    ? [{ label: editing.value?.name ?? 'Route' }, { label: 'Edit' }]
    : [{ label: 'New route' }]),
])

const submitLabel = computed(() => (props.slug ? 'Save changes' : 'Create route'))

const pastedGeoJson = ref('')

const { deleting, confirmAndDelete } = useRouteDeletion()

onMounted(() => {
  void start()
})

async function handleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importGeoJson(await file.text(), file.name)
  // Cleared so choosing the same file again, after fixing it, fires change.
  input.value = ''
}

function handlePaste(): void {
  if (importGeoJson(pastedGeoJson.value)) pastedGeoJson.value = ''
}

const stats = computed(() => {
  if (pointCount.value === 0) return 'No shape yet.'
  const points = `${pointCount.value} ${pointCount.value === 1 ? 'point' : 'points'}`
  return pointCount.value < 2 ? points : `${points} · ${formatKm(lengthM.value)}`
})

const saveStatus = computed<{ label: string; tone: 'quiet' | 'dirty' | 'busy' | 'error' }>(() => {
  if (submitting.value) return { label: props.slug ? 'Saving…' : 'Creating…', tone: 'busy' }
  if (submitError.value) return { label: "Couldn't save", tone: 'error' }
  if (hasChanges.value) return { label: props.slug ? 'Unsaved changes' : 'Not created yet', tone: 'dirty' }
  return { label: props.slug ? 'No changes' : 'Nothing here yet', tone: 'quiet' }
})

const TONE_DOT_CLASS = {
  quiet: 'bg-ink-faint',
  dirty: 'bg-apricot',
  busy: 'animate-pulse bg-coral',
  error: 'bg-error',
} as const

// Only a path on this site is followed back: the query is written by the
// page that sent the author here, but a pasted link could say anything.
function returnPath(): string | null {
  const value = route?.query.return
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}

// Back where the author came from with the new route picked, or on to the
// route's own editor. Replaced rather than pushed, so going back does not
// reopen a form whose draft has already become a route.
function afterCreate(slug: string): RouteLocationRaw {
  const back = returnPath()
  if (!back) return `/authoring/routes/${slug}`
  const target = router.resolve(back)
  return { path: target.path, query: { ...target.query, route: slug }, hash: target.hash }
}

watch(createdSlug, (slug) => {
  if (!slug) return
  toast('Route created')
  void router.replace(afterCreate(slug))
})

watch(savedCount, () => toast('Changes saved'))
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="trail" />
    <div class="mt-8 flex items-start justify-between gap-4">
      <h1 class="font-display text-display text-ink-true">
        {{ slug ? 'Edit route' : 'New route' }}
      </h1>
      <DeleteMenu
        v-if="editing"
        noun="route"
        :deleting="deleting"
        @delete="confirmAndDelete(editing)"
      />
    </div>

    <p
      v-if="editNotFound"
      class="font-body text-body mt-3 text-ink-muted"
      data-testid="route-not-found"
    >
      No route of yours matches "{{ slug }}".
    </p>
    <p
      v-else-if="editLoadFailed"
      class="font-body text-body mt-3 text-ink-muted"
      role="alert"
      data-testid="route-error"
    >
      Failed to load this route. Please try again.
    </p>

    <PageSkeleton
      v-else-if="loading || !ready"
      label="Loading route"
      :cards="2"
      class="mt-8"
      data-testid="route-loading"
    />

    <form
      v-else
      class="mt-8 flex flex-col gap-6"
      @submit.prevent="submit"
    >
      <fieldset
        class="flex min-w-0 flex-col gap-6"
        :disabled="submitting"
        data-testid="form-body"
      >
        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Identity
          </h2>
          <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
            <label :class="FIELD_LABEL_CLASS">
              Route name
              <input
                v-model="name"
                :class="FIELD_INPUT_CLASS"
                data-testid="route-name"
                type="text"
                @blur="touchName"
              >
            </label>
            <label :class="FIELD_LABEL_CLASS">
              Mode
              <select
                v-model="mode"
                :class="FIELD_INPUT_CLASS"
                data-testid="route-mode"
              >
                <option
                  v-for="option in ROUTE_MODES"
                  :key="option"
                  :value="option"
                >
                  {{ option }}
                </option>
              </select>
            </label>
          </div>
          <label class="font-body text-caption mt-3 flex items-center gap-2 text-ink">
            <input
              v-model="bidirectional"
              type="checkbox"
              data-testid="route-bidirectional"
            >
            Lines can run it in both directions
          </label>
        </section>

        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Shape
          </h2>
          <p
            v-if="geometryLocked"
            class="font-body text-caption mt-2 flex items-center gap-2 text-ink"
            role="status"
            data-testid="geometry-locked"
          >
            <span
              class="size-2 shrink-0 rounded-full bg-apricot"
              aria-hidden="true"
            />
            {{ geometryLockMessage }}
          </p>
          <p
            v-else
            class="font-body text-caption mt-2 text-ink-muted"
          >
            Import a GeoJSON line: a LineString, a Feature holding one, or a collection with exactly one.
          </p>
          <p
            class="font-body text-caption mt-2 text-ink"
            data-testid="route-stats"
          >
            {{ stats }}
          </p>

          <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label :class="FIELD_LABEL_CLASS">
              Import a file
              <input
                :class="[FIELD_INPUT_CLASS, 'file:mr-2 file:cursor-pointer file:border-0 file:bg-transparent file:p-0 file:font-display file:text-btn file:uppercase file:text-ink']"
                data-testid="route-file"
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                :disabled="geometryLocked"
                @change="handleFile"
              >
            </label>
            <div class="flex flex-col gap-1">
              <label :class="FIELD_LABEL_CLASS">
                Or paste GeoJSON
                <textarea
                  v-model="pastedGeoJson"
                  :class="FIELD_INPUT_CLASS"
                  data-testid="route-geojson-text"
                  rows="3"
                  :disabled="geometryLocked"
                  placeholder="A LineString, a Feature, or a FeatureCollection"
                />
              </label>
              <button
                type="button"
                :class="[SECONDARY_BUTTON_CLASS, 'self-start']"
                data-testid="import-geojson"
                :disabled="geometryLocked || !pastedGeoJson.trim()"
                @click="handlePaste"
              >
                Use pasted GeoJSON
              </button>
            </div>
          </div>

          <p
            v-if="importError"
            class="font-body text-caption mt-2 text-error"
            role="alert"
            data-testid="import-error"
          >
            {{ importError }}
          </p>
          <p
            v-else-if="importNote"
            class="font-body text-caption mt-2 text-ink-muted"
            role="status"
            data-testid="import-note"
          >
            {{ importNote }}
          </p>
        </section>

        <div
          class="h-[70vh]"
          data-testid="map-panel"
        >
          <MapView
            label="Route preview map"
            :loading="false"
            :isochrone-data="null"
            :routes="mapRoutes"
            :stations="[]"
            hide-isochrone-legend
          />
        </div>

        <section class="rounded-(--radius-box) border border-border bg-surface p-4">
          <h2 class="font-display text-h3 text-ink-true">
            Description
            <span class="font-body text-caption font-normal text-ink-muted">optional</span>
          </h2>
          <label :class="[FIELD_LABEL_CLASS, 'mt-3']">
            <span class="sr-only">Description</span>
            <textarea
              v-model="description"
              :class="FIELD_INPUT_CLASS"
              data-testid="route-description"
              rows="4"
            />
          </label>
        </section>
      </fieldset>

      <div
        class="sticky bottom-0 z-20 flex flex-col gap-2 rounded-t-(--radius-box) border border-b-0 border-border bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/6%)] backdrop-blur"
        data-testid="save-bar"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p
            class="font-body text-caption flex items-center gap-2 text-ink"
            role="status"
            data-testid="save-status"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="TONE_DOT_CLASS[saveStatus.tone]"
              aria-hidden="true"
            />
            {{ saveStatus.label }}
          </p>
          <button
            type="submit"
            :class="[PRIMARY_BUTTON_CLASS, 'ml-auto']"
            data-testid="submit"
            :disabled="!canSave"
          >
            {{ submitLabel }}
          </button>
        </div>
        <p
          v-if="validationMessage"
          class="font-body text-caption text-error"
          role="alert"
          data-testid="validation-error"
        >
          {{ validationMessage }}
        </p>
        <p
          v-if="submitError"
          class="font-body text-caption text-error"
          role="alert"
          data-testid="submit-error"
        >
          {{ submitError }}
        </p>
      </div>
    </form>
  </main>
</template>
