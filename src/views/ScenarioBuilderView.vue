<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDraftsStore } from '../stores/drafts'
import { authoringFault } from '../api/authoringFault'
import { ApiError, isSessionExpiry } from '../api/authoring/client'
import { fetchMyServices } from '../api/authoring/services'
import { compileScenario, createScenario, fetchScenario, updateScenario } from '../api/authoring/scenarios'
import type { ScenarioInput, Service } from '../api/authoring/types'
import { useCompileJob } from '../composables/useCompileJob'
import { usePageTitle } from '../composables/usePageTitle'
import BreadcrumbTrail from '../components/BreadcrumbTrail.vue'
import FieldSkeleton from '../components/FieldSkeleton.vue'
import ListSkeleton from '../components/ListSkeleton.vue'
import LoadingRegion from '../components/LoadingRegion.vue'
import SkeletonShape from '../components/SkeletonShape.vue'
import { AUTHORING_CRUMB, type Crumb } from '../components/crumbs'
import { PRIMARY_BUTTON_CLASS } from '../components/buttonStyles'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'
import { ACTION_LINK_CLASS } from '../components/linkStyles'

// One view for both writes, as with services: only the heading, the button,
// where the form's state lives and where a save ends up differ.
const props = defineProps<{ slug?: string }>()

const router = useRouter()
const drafts = useDraftsStore()

const services = ref<Service[]>([])
const servicesLoading = ref(true)
const servicesError = ref(false)

const submitting = ref(false)
const submitError = ref('')

// An edit is held here rather than in the drafts store's one scenario slot, so
// opening one never overwrites a new scenario still being put together. What
// an abandoned edit would have saved over is still on the server.
const editDraft = ref<ScenarioInput | null>(null)
const editLoading = ref(Boolean(props.slug))
const editNotFound = ref(false)
const editLoadFailed = ref(false)
const editName = ref('')

const draft = computed(() => (props.slug ? editDraft.value : drafts.scenarioDraft))

function patchDraft(patch: Partial<ScenarioInput>): void {
  if (!props.slug) drafts.patchScenarioDraft(patch)
  else if (editDraft.value) Object.assign(editDraft.value, patch)
}

function toggleService(serviceId: string): void {
  if (!props.slug) {
    drafts.toggleService(serviceId)
    return
  }
  if (!editDraft.value) return
  const selected = editDraft.value.service_ids
  editDraft.value.service_ids = selected.includes(serviceId)
    ? selected.filter((id) => id !== serviceId)
    : [...selected, serviceId]
}

async function loadServices(): Promise<void> {
  try {
    services.value = await fetchMyServices()
  } catch (err) {
    // The user is already being sent to sign in: stay loading rather than
    // flash a failure first.
    if (isSessionExpiry(err)) return
    servicesError.value = true
  }
  servicesLoading.value = false
}

async function loadEdit(slug: string): Promise<void> {
  try {
    const scenario = await fetchScenario(slug)
    editName.value = scenario.name
    editDraft.value = {
      name: scenario.name,
      description: scenario.description,
      service_ids: [...scenario.service_ids],
    }
  } catch (err) {
    if (isSessionExpiry(err)) return
    if (err instanceof ApiError && err.status === 404) editNotFound.value = true
    else editLoadFailed.value = true
  }
  editLoading.value = false
}

onMounted(async () => {
  if (props.slug) {
    await Promise.all([loadEdit(props.slug), loadServices()])
    return
  }
  if (!drafts.hasScenarioDraft) drafts.startScenarioDraft()
  await loadServices()
})

const name = computed({
  get: () => draft.value?.name ?? '',
  set: (value: string) => patchDraft({ name: value }),
})

const description = computed({
  get: () => draft.value?.description ?? '',
  set: (value: string) => patchDraft({ description: value }),
})

function isSelected(serviceId: string): boolean {
  return draft.value?.service_ids.includes(serviceId) ?? false
}

const canSubmit = computed(() => {
  const current = draft.value
  if (!current || submitting.value) return false
  return current.name.trim() !== '' && current.service_ids.length > 0
})

const submitLabel = computed(() => {
  if (submitting.value) return 'Saving…'
  return props.slug ? 'Save changes' : 'Save scenario'
})

const {
  compiling,
  compileError,
  result: compiledGraph,
  trigger: triggerCompile,
} = useCompileJob(compileScenario, 'scenario')

const savedSlug = ref<string | null>(null)

const scenarioPath = computed(() => `/authoring/scenarios/${savedSlug.value ?? props.slug}`)

// Named after the scenario as loaded, not the name field: the tab should not
// rename itself on every keystroke.
usePageTitle(() => (editName.value ? `Edit ${editName.value}` : null))

const trail = computed<Crumb[]>(() => [
  AUTHORING_CRUMB,
  ...(props.slug
    ? [{ label: editName.value || 'Scenario', to: scenarioPath.value }, { label: 'Edit' }]
    : [{ label: 'New scenario' }]),
])

// The scenario's page reads the last compile that succeeded, which predates
// the edit, so an edit recompiles here and lands there only once that compile
// has. Replaced rather than pushed, so going back does not reopen a finished
// edit.
watch(compiledGraph, (graph) => {
  if (graph && savedSlug.value) void router.replace(scenarioPath.value)
})

async function handleSave(): Promise<void> {
  const current = draft.value
  if (!current || !canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    if (props.slug) {
      const saved = await updateScenario(props.slug, current)
      savedSlug.value = saved.slug
      submitting.value = false
      await triggerCompile(saved.slug)
      return
    }
    const created = await createScenario(current)
    drafts.clearScenarioDraft()
    await router.push({ name: 'scenario-detail', params: { slug: created.slug } })
  } catch (err) {
    submitError.value = authoringFault(err, 'scenario')
    submitting.value = false
  }
}
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <BreadcrumbTrail :items="trail" />
    <h1 class="mt-8 font-display text-display text-ink-true">
      {{ slug ? 'Edit scenario' : 'New scenario' }}
    </h1>

    <p
      v-if="editNotFound"
      class="font-body text-body mt-3 text-ink-muted"
      data-testid="scenario-not-found"
    >
      No scenario of yours matches "{{ slug }}".
    </p>
    <p
      v-else-if="editLoadFailed"
      class="font-body text-body mt-3 text-ink-muted"
      role="alert"
      data-testid="scenario-error"
    >
      Failed to load this scenario. Please try again.
    </p>
    <LoadingRegion
      v-else-if="editLoading"
      label="Loading scenario"
      class="mt-8 flex max-w-[560px] flex-col gap-6"
      data-testid="draft-loading"
    >
      <FieldSkeleton />
      <FieldSkeleton :rows="3" />
      <SkeletonShape shape="card" />
    </LoadingRegion>

    <section
      v-else-if="savedSlug"
      class="mt-8 flex max-w-[560px] flex-col gap-3"
    >
      <p
        v-if="compiling || compiledGraph"
        class="font-body text-caption text-ink-muted italic"
        data-testid="compiling-status"
      >
        Saved. Compiling this scenario…
      </p>
      <p
        v-else-if="compileError"
        class="font-body text-caption text-coral"
        role="alert"
        data-testid="compile-error"
      >
        Your changes are saved, but the recompile failed. {{ compileError }}
      </p>
      <router-link
        :to="scenarioPath"
        :class="ACTION_LINK_CLASS"
        data-testid="go-to-scenario"
      >
        Go to the scenario
      </router-link>
    </section>

    <form
      v-else
      class="mt-8 flex max-w-[560px] flex-col gap-6"
      @submit.prevent="handleSave"
    >
      <label :class="FIELD_LABEL_CLASS">
        Scenario name
        <input
          v-model="name"
          :class="FIELD_INPUT_CLASS"
          data-testid="scenario-name"
          type="text"
        >
      </label>

      <label :class="FIELD_LABEL_CLASS">
        Description
        <textarea
          v-model="description"
          :class="FIELD_INPUT_CLASS"
          data-testid="scenario-description"
          rows="3"
        />
      </label>

      <section class="rounded-(--radius-box) border border-border bg-surface p-4">
        <h2 class="font-display text-h3 text-ink-true">
          Services
        </h2>
        <ListSkeleton
          v-if="servicesLoading"
          label="Loading your services"
          :caption="false"
          background="white"
          class="mt-3"
          data-testid="services-loading"
        />
        <p
          v-else-if="servicesError"
          class="font-body text-caption mt-2 text-error"
          role="alert"
          data-testid="services-error"
        >
          Couldn't load your services.
        </p>
        <p
          v-else-if="services.length === 0"
          class="font-body text-caption mt-2 text-ink-muted italic"
          data-testid="services-empty"
        >
          You haven't created any services yet.
        </p>
        <ul
          v-else
          class="mt-3 flex flex-col gap-2"
          data-testid="service-checklist"
        >
          <li
            v-for="service in services"
            :key="service.id"
          >
            <label class="font-body text-body flex cursor-pointer items-center gap-2 rounded-(--radius-field) border border-border bg-white px-3 py-2 text-ink">
              <input
                type="checkbox"
                :checked="isSelected(service.id)"
                :data-testid="`service-checkbox-${service.id}`"
                @change="toggleService(service.id)"
              >
              {{ service.name }}
            </label>
          </li>
        </ul>
      </section>

      <button
        type="submit"
        :class="PRIMARY_BUTTON_CLASS"
        data-testid="save-scenario"
        :disabled="!canSubmit"
      >
        {{ submitLabel }}
      </button>

      <p
        v-if="submitError"
        class="font-body text-caption text-error"
        role="alert"
        data-testid="submit-error"
      >
        {{ submitError }}
      </p>
    </form>
  </main>
</template>
