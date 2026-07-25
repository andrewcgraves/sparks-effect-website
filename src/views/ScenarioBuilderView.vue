<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDraftsStore } from '../stores/drafts'
import { ApiError } from '../api/authoring/client'
import { fetchMyServices } from '../api/authoring/services'
import { createScenario } from '../api/authoring/scenarios'
import type { Service } from '../api/authoring/types'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from '../components/fieldStyles'

const router = useRouter()
const drafts = useDraftsStore()

const services = ref<Service[]>([])
const servicesLoading = ref(true)
const servicesError = ref(false)

const submitting = ref(false)
const submitError = ref('')

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

// After saving, hand off to the scenario's own preview page rather than
// plotting the isochrone inline here: /authoring/scenarios/:slug loads the
// saved scenario, compiles it if needed, and plots against it — the same
// experience, but reachable again later instead of only in this one post-save
// session (and it opens on the drawn map rather than an empty one).
async function handleSave(): Promise<void> {
  const draft = drafts.scenarioDraft
  if (!draft || !canSubmit.value) return
  submitting.value = true
  submitError.value = ''
  try {
    const created = await createScenario(draft)
    drafts.clearScenarioDraft()
    await router.push({ name: 'scenario-detail', params: { slug: created.slug } })
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Something went wrong saving the scenario.'
    submitting.value = false
  }
}

</script>

<template>
  <main class="min-h-svh p-(--page-padding)">
    <h1 class="font-display text-display text-ink-true">
      New scenario
    </h1>

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
  </main>
</template>
