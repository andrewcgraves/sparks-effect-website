<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useJobsStore } from '../stores/jobs'
import { ApiError } from '../api/authoring/client'
import { fetchMyServices } from '../api/authoring/services'
import { compileScenario, createScenario, fetchScenarioIsochrone } from '../api/authoring/scenarios'
import type { Service } from '../api/authoring/types'
import type { ChainResponse } from '../fixtures/isochrone'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const drafts = useDraftsStore()
const jobs = useJobsStore()

const services = ref<Service[]>([])
const servicesLoading = ref(true)
const servicesError = ref(false)

const savedSlug = ref<string | null>(null)
const submitting = ref(false)
const submitError = ref('')
const compiling = ref(false)
const compileError = ref('')

const origin = ref<{ lat: number; lng: number } | null>(null)
const isochroneData = ref<ChainResponse | null>(null)
const isochroneLoading = ref(false)
const isochroneError = ref<string | null>(null)
const recompiling = ref(false)

onMounted(async () => {
  if (!drafts.hasScenarioDraft) drafts.startScenarioDraft()
  try {
    services.value = await fetchMyServices()
  } catch {
    servicesError.value = true
  } finally {
    servicesLoading.value = false
  }
})

const name = computed({
  get: () => drafts.scenarioDraft?.name ?? '',
  set: (value: string) => drafts.patchScenarioDraft({ name: value }),
})

const description = computed({
  get: () => drafts.scenarioDraft?.description ?? '',
  set: (value: string) => drafts.patchScenarioDraft({ description: value }),
})

function isSelected(serviceId: string): boolean {
  return drafts.scenarioDraft?.service_ids.includes(serviceId) ?? false
}

const canSubmit = computed(() => {
  const draft = drafts.scenarioDraft
  if (!draft || submitting.value) return false
  return draft.name.trim() !== '' && draft.service_ids.length > 0
})

// A stale-graph retry should settle in one or two hops in practice; this just
// bounds it so a persistently stale signal can't spin the UI forever.
const MAX_STALE_GRAPH_RETRIES = 3

// A 409 with the stale-graph code is not an error to show the user (SPA-83
// decision 4): it means a compiled graph fell behind an edit, so the fix is
// to fire the compile again and retry, not to surface a failure.
async function triggerCompile(slug: string, attempt = 1): Promise<void> {
  compiling.value = true
  compileError.value = ''
  try {
    const job = await compileScenario(slug)
    await jobs.track(job.id)
  } catch (err) {
    if (err instanceof ApiError && err.code === 'stale_graph' && attempt < MAX_STALE_GRAPH_RETRIES) {
      await triggerCompile(slug, attempt + 1)
      return
    }
    compileError.value = err instanceof Error ? err.message : 'Compile failed.'
  } finally {
    compiling.value = false
  }
}

async function handleSave(): Promise<void> {
  const draft = drafts.scenarioDraft
  if (!draft || !canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const created = await createScenario(draft)
    drafts.clearScenarioDraft()
    savedSlug.value = created.slug
    await triggerCompile(created.slug)
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Something went wrong saving the scenario.'
  } finally {
    submitting.value = false
  }
}

function onOriginChange(coords: { lat: number; lng: number } | null) {
  origin.value = coords
}

// Reopening a scenario whose member service was edited elsewhere answers 409
// (stale_graph) on the isochrone call itself, not just on compile — recompile
// and retry transparently, surfacing "recompiling…" rather than an error.
async function generateIsochrone(
  payload: { lat: number; lng: number; duration: number; mode: 'walk' | 'bike' | 'drive' },
  attempt = 1,
): Promise<void> {
  if (!savedSlug.value) return
  isochroneLoading.value = true
  isochroneError.value = null
  try {
    isochroneData.value = await fetchScenarioIsochrone(savedSlug.value, {
      lat: payload.lat,
      lng: payload.lng,
      budget_mins: payload.duration,
      mode: payload.mode,
    })
  } catch (err) {
    if (err instanceof ApiError && err.code === 'stale_graph' && attempt < MAX_STALE_GRAPH_RETRIES) {
      recompiling.value = true
      await triggerCompile(savedSlug.value)
      recompiling.value = false
      if (!compileError.value) {
        await generateIsochrone(payload, attempt + 1)
        return
      }
    }
    isochroneError.value = 'Failed to generate isochrone. Please try again.'
  } finally {
    isochroneLoading.value = false
  }
}

async function handleIsochroneSubmit(payload: {
  lat: number
  lng: number
  duration: number
  mode: 'walk' | 'bike' | 'drive'
}): Promise<void> {
  origin.value = { lat: payload.lat, lng: payload.lng }
  await generateIsochrone(payload)
}

const isochroneFormLoading = computed(() => isochroneLoading.value || recompiling.value)
</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <h1 class="font-display text-display text-ink-true">
      New scenario
    </h1>

    <template v-if="!savedSlug">
      <form
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
          <p
            v-if="servicesLoading"
            class="font-body text-caption mt-2 text-ink-muted italic"
          >
            Loading your services…
          </p>
          <p
            v-else-if="servicesError"
            class="font-body text-caption mt-2 text-coral"
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
                  @change="drafts.toggleService(service.id)"
                >
                {{ service.name }}
              </label>
            </li>
          </ul>
        </section>

        <button
          type="submit"
          class="font-display text-btn cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-coral"
          data-testid="save-scenario"
          :disabled="!canSubmit"
        >
          {{ submitting ? 'Saving…' : 'Save scenario' }}
        </button>

        <p
          v-if="submitError"
          class="font-body text-caption text-coral"
          role="alert"
          data-testid="submit-error"
        >
          {{ submitError }}
        </p>
      </form>
    </template>

    <template v-else>
      <p
        v-if="compiling"
        class="font-body text-caption mt-8 text-ink-muted italic"
        data-testid="compiling-status"
      >
        Scenario saved. Compiling…
      </p>
      <p
        v-else-if="compileError"
        class="font-body text-caption mt-8 text-coral"
        role="alert"
        data-testid="compile-error"
      >
        {{ compileError }}
      </p>

      <div
        v-else
        class="mt-8 grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]"
      >
        <div class="h-[70vh] overflow-hidden rounded-(--radius-box) border border-border">
          <MapView
            :origin="origin"
            :isochrone-data="isochroneData"
            :loading="isochroneFormLoading"
            :routes="[]"
            :stations="[]"
            :services="[]"
          />
        </div>

        <div class="flex flex-col gap-4">
          <IsochroneForm
            :error="isochroneError"
            :loading="isochroneFormLoading"
            @submit="handleIsochroneSubmit"
            @origin-change="onOriginChange"
          />
          <p
            v-if="recompiling"
            class="font-body text-caption text-ink-muted italic"
            role="status"
            data-testid="recompiling-status"
          >
            A member service changed — recompiling…
          </p>
        </div>
      </div>
    </template>
  </main>
</template>
