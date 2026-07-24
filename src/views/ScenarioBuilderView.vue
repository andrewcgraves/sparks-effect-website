<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDraftsStore } from '../stores/drafts'
import { useScenarioIsochrone } from '../composables/useScenarioIsochrone'
import { ApiError } from '../api/authoring/client'
import { fetchMyServices } from '../api/authoring/services'
import { createScenario } from '../api/authoring/scenarios'
import type { Service } from '../api/authoring/types'
import IsochroneForm from '../IsochroneForm.vue'
import MapView from '../components/MapView.vue'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const drafts = useDraftsStore()

const services = ref<Service[]>([])
const servicesLoading = ref(true)
const servicesError = ref(false)

// Doubles as "has this draft been saved" (gates the builder form) and the
// record's identity for the compile/isochrone calls that follow — a separate
// boolean would just track the same transition redundantly.
const savedSlug = ref<string | null>(null)
const submitting = ref(false)
const submitError = ref('')

// True once the post-save compile has succeeded at least once. Distinguishes
// that first compile (shown full-screen, replacing the builder form) from any
// later recompile triggered by a stale-graph isochrone retry (shown inline,
// alongside the still-visible map and form — see isochroneFormLoading below).
const hasCompiledOnce = ref(false)

// The compile + isochrone half is shared with the preview page at
// /authoring/scenarios/:slug, which plots the same way against a scenario it
// loaded rather than one it just saved.
const {
  compiling,
  compileError,
  triggerCompile,
  origin,
  isochroneData,
  isochroneError,
  isochroneFormLoading,
  nearMisses,
  realisedClusters,
  onOriginChange,
  handleIsochroneSubmit,
} = useScenarioIsochrone(() => savedSlug.value)

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

// Near-misses and clusters name stops by service_id; the checklist load
// already has every candidate service's display name, so look it up rather
// than have the compile result carry names twice.
function serviceName(serviceId: string): string {
  return services.value.find((service) => service.id === serviceId)?.name ?? serviceId
}

function formatMeters(total: number): string {
  return `${Math.round(total)} m`
}

const canSubmit = computed(() => {
  const draft = drafts.scenarioDraft
  if (!draft || submitting.value) return false
  return draft.name.trim() !== '' && draft.service_ids.length > 0
})

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
    if (!compileError.value) hasCompiledOnce.value = true
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Something went wrong saving the scenario.'
  } finally {
    submitting.value = false
  }
}

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
        v-if="compiling && !hasCompiledOnce"
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
            v-if="compiling"
            class="font-body text-caption text-ink-muted italic"
            role="status"
            data-testid="recompiling-status"
          >
            A member service changed — recompiling…
          </p>

          <section
            v-if="nearMisses.length"
            class="rounded-(--radius-box) border border-border bg-surface p-4"
            data-testid="near-miss-list"
          >
            <h2 class="font-display text-h3 text-ink-true">
              Did not connect
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
              <li
                v-for="(nearMiss, index) in nearMisses"
                :key="index"
                class="font-body text-caption text-ink"
                data-testid="near-miss-row"
              >
                {{ nearMiss.a.name }} ({{ serviceName(nearMiss.a.service_id) }}) and
                {{ nearMiss.b.name }} ({{ serviceName(nearMiss.b.service_id) }})
                are {{ formatMeters(nearMiss.distance_m) }} apart and did not connect
              </li>
            </ul>
          </section>

          <section
            v-if="realisedClusters.length"
            class="rounded-(--radius-box) border border-border bg-surface p-4"
            data-testid="realised-clusters"
          >
            <h2 class="font-display text-h3 text-ink-true">
              Realised interchanges
            </h2>
            <ul class="mt-3 flex flex-col gap-2">
              <li
                v-for="cluster in realisedClusters"
                :key="cluster.key"
                class="font-body text-caption text-ink"
                data-testid="realised-cluster-row"
              >
                {{ cluster.names.join(', ') }}
              </li>
            </ul>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>
