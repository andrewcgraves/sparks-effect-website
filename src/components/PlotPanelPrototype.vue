<script setup lang="ts">
// PROTOTYPE (SPA-501) — throwaway. Five arrangements of "one plot panel with saved
// splash zones as starting presets", switched by ?variant= on /scenario/:slug.
//   A Chip row · B Compact list · C Slider (Saved | Plot your own)
//   D Expand (collapsed until opened) · E Popup (from the starting-point row)
// One IsochroneForm instance is shared by all five, so what was typed survives a
// variant switch. ?offline=1 fakes routing offline; ?outdated=1 marks one entry
// out of date.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import IsochroneForm from '../IsochroneForm.vue'
import { useOwnedList } from '../composables/useOwnedList'
import { latestAttempt } from '../composables/latestAttempt'
import {
  fetchPrerenderedIsochrone,
  listPrerenderedIsochrones,
  type PrerenderedIsochroneSummary,
} from '../api/prerenderedIsochrones'
import type { ChainResponse } from '../fixtures/isochrone'
import type { IsochronePayload } from '../isochroneQuery'
import type { TravelMode } from '../api/authoring/types'
import { modeLabel } from '../copy/modes'

export type PlotPanelVariant = 'A' | 'B' | 'C' | 'D' | 'E'

const props = defineProps<{
  variant: PlotPanelVariant
  slug: string
  selectedId: string | null
  error: string | null
  loading: boolean
  offline: boolean
  initial: Partial<IsochronePayload>
}>()

const emit = defineEmits<{
  submit: [payload: IsochronePayload]
  'origin-change': [origin: { lat: number; lng: number } | null]
  'pick-armed': [armed: boolean]
  select: [result: ChainResponse]
  'update:selectedId': [id: string | null]
  available: [hasAny: boolean]
}>()

const route = useRoute()
const { items: rawItems, loading: listLoading } = useOwnedList(() => listPrerenderedIsochrones(props.slug))
const items = computed(() =>
  rawItems.value.map((e, i) => (route.query.outdated === '1' && i === 1 ? { ...e, outdated: true } : e)),
)
watch(listLoading, (still) => {
  if (!still) emit('available', items.value.length > 0)
})

const form = useTemplateRef<InstanceType<typeof IsochroneForm>>('form')
const pendingId = ref<string | null>(null)
const detailError = ref<string | null>(null)
const attempt = latestAttempt()

const OUTDATED_HINT = 'Plotted before this network’s lines last changed, so it may be out of date.'

function place(entry: PrerenderedIsochroneSummary): string {
  return entry.label.split(' - ')[0]
}
function detail(entry: PrerenderedIsochroneSummary): string {
  return `${entry.budget_mins} min · ${modeLabel(entry.mode)}`
}

const selected = computed(() => items.value.find((e) => e.id === props.selectedId) ?? null)

async function choose(entry: PrerenderedIsochroneSummary): Promise<void> {
  const mine = attempt.begin()
  pendingId.value = entry.id
  detailError.value = null
  // The form fills at once — the visitor sees the answer to "where does this
  // start from" before the drawing arrives.
  form.value?.fillFrom({
    lat: entry.lat,
    lng: entry.lng,
    duration: entry.budget_mins,
    mode: entry.mode as TravelMode,
    place: place(entry),
  })
  popupOpen.value = false
  expanded.value = false
  try {
    const d = await fetchPrerenderedIsochrone(entry.id)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    emit('update:selectedId', entry.id)
    emit('select', d.result)
  } catch (e) {
    console.error(e)
    if (!attempt.isCurrent(mine)) return
    pendingId.value = null
    detailError.value = `Couldn't load "${entry.label}". Please try again.`
  }
}

defineExpose({
  setOriginFromMap: (coord: { lat: number; lng: number }) => form.value?.setOriginFromMap(coord),
})

// C — slider
const cTab = ref<'saved' | 'plot'>('saved')
watch(() => props.offline, (off) => { if (off) cTab.value = 'saved' })
// D — expand
const expanded = ref(false)
// E — popup
const popupOpen = ref(false)
const popupRoot = ref<HTMLElement | null>(null)
function onDocClick(e: MouseEvent) {
  if (popupOpen.value && popupRoot.value && !popupRoot.value.contains(e.target as Node)) popupOpen.value = false
}
function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') popupOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('keydown', onEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('keydown', onEsc)
})

const PRESSED =
  'aria-pressed:border-coral aria-pressed:bg-coral aria-pressed:text-white'
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="plot-panel-prototype"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Plot a splash zone
    </h2>

    <!-- C · Slider: Saved | Plot your own -->
    <template v-if="variant === 'C' && items.length">
      <div
        class="grid grid-cols-2 gap-1 rounded-(--radius-selector) border border-border bg-white p-1"
        role="tablist"
      >
        <button
          v-for="t in ([['saved', `Saved (${items.length})`], ['plot', 'Plot your own']] as const)"
          :key="t[0]"
          type="button"
          role="tab"
          :aria-selected="cTab === t[0]"
          class="font-body text-caption cursor-pointer rounded-(--radius-selector) px-3 py-1.5 transition-colors"
          :class="cTab === t[0] ? 'bg-coral text-white' : 'text-ink-muted hover:text-ink'"
          @click="cTab = t[0]"
        >
          {{ t[1] }}
        </button>
      </div>
      <div
        v-show="cTab === 'saved'"
        class="flex flex-col gap-2"
      >
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="entry in items"
            :key="entry.id"
            type="button"
            class="group font-body flex cursor-pointer flex-col gap-0.5 rounded-(--radius-field) border border-border bg-white px-2.5 py-2 text-left text-[14px] leading-tight text-ink transition-colors hover:border-coral"
            :class="PRESSED"
            :aria-pressed="selectedId === entry.id"
            :aria-busy="pendingId === entry.id"
            @click="choose(entry)"
          >
            <span class="flex items-center gap-1">
              {{ place(entry) }}
              <span
                v-if="entry.outdated"
                class="size-2 shrink-0 rounded-full bg-apricot"
                :title="OUTDATED_HINT"
                :aria-label="`Out of date — ${OUTDATED_HINT}`"
              />
            </span>
            <span class="text-micro text-ink-muted uppercase group-aria-pressed:text-white/80">
              {{ pendingId === entry.id ? 'Loading…' : detail(entry) }}
            </span>
          </button>
        </div>
        <button
          v-if="selected && !offline"
          type="button"
          class="font-body text-caption self-start text-ink-muted italic underline hover:text-coral"
          @click="cTab = 'plot'"
        >
          Change the starting point, time or mode →
        </button>
      </div>
    </template>

    <IsochroneForm
      v-show="variant !== 'C' || !items.length || cTab === 'plot'"
      ref="form"
      bare
      :error="error"
      :loading="loading"
      :offline="offline"
      :initial="initial"
      @submit="emit('submit', $event)"
      @origin-change="emit('origin-change', $event)"
      @pick-armed="emit('pick-armed', $event)"
    >
      <template #presets>
        <!-- A · Chip row -->
        <div
          v-if="variant === 'A' && items.length"
          class="flex flex-col gap-1.5"
        >
          <span class="font-body text-micro text-ink-muted italic uppercase">Start from a saved splash zone</span>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="entry in items"
              :key="entry.id"
              type="button"
              class="font-body inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-[13px] text-ink transition-colors hover:border-coral pointer-coarse:min-h-9"
              :class="PRESSED"
              :aria-pressed="selectedId === entry.id"
              :aria-busy="pendingId === entry.id"
              :title="`${entry.label}${entry.outdated ? ' — ' + OUTDATED_HINT : ''}`"
              @click="choose(entry)"
            >
              {{ place(entry) }}
              <span
                v-if="entry.outdated"
                class="size-2 rounded-full bg-apricot"
                :aria-label="`Out of date — ${OUTDATED_HINT}`"
              />
            </button>
          </div>
        </div>

        <!-- B · Compact list -->
        <div
          v-else-if="variant === 'B' && items.length"
          class="flex flex-col gap-1.5"
        >
          <span class="font-body text-micro text-ink-muted italic uppercase">Start from a saved splash zone</span>
          <ul class="divide-y divide-border overflow-hidden rounded-(--radius-field) border border-border bg-white">
            <li
              v-for="entry in items"
              :key="entry.id"
            >
              <button
                type="button"
                class="group font-body flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[14px] text-ink transition-colors hover:bg-coral/10 aria-pressed:bg-coral aria-pressed:text-white"
                :aria-pressed="selectedId === entry.id"
                :aria-busy="pendingId === entry.id"
                @click="choose(entry)"
              >
                <span class="min-w-0 flex-1 truncate">{{ place(entry) }}</span>
                <span
                  v-if="entry.outdated"
                  class="font-display text-micro rounded-(--radius-field) border border-apricot bg-apricot/15 px-1 text-ink uppercase group-aria-pressed:border-white/70 group-aria-pressed:bg-white/25 group-aria-pressed:text-white"
                  :title="OUTDATED_HINT"
                >Out of date</span>
                <span class="text-micro shrink-0 text-ink-muted uppercase group-aria-pressed:text-white/80">
                  {{ pendingId === entry.id ? 'Loading…' : detail(entry) }}
                </span>
              </button>
            </li>
          </ul>
        </div>

        <!-- D · Expand -->
        <div
          v-else-if="variant === 'D' && items.length"
          class="flex flex-col overflow-hidden rounded-(--radius-field) border border-border bg-white"
        >
          <button
            type="button"
            class="font-body flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-[14px] text-ink hover:text-coral"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            <span class="flex-1">
              <template v-if="selected">
                <span class="text-micro text-ink-muted uppercase italic">From saved:</span>
                {{ place(selected) }}
              </template>
              <template v-else>Start from a saved splash zone</template>
            </span>
            <span class="text-micro text-ink-muted">{{ items.length }}</span>
            <span
              aria-hidden="true"
              class="transition-transform"
              :class="expanded ? 'rotate-180' : ''"
            >▾</span>
          </button>
          <ul
            v-if="expanded"
            class="divide-y divide-border border-t border-border"
          >
            <li
              v-for="entry in items"
              :key="entry.id"
            >
              <button
                type="button"
                class="group font-body flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[14px] text-ink hover:bg-coral/10 aria-pressed:bg-coral aria-pressed:text-white"
                :aria-pressed="selectedId === entry.id"
                @click="choose(entry)"
              >
                <span class="min-w-0 flex-1 truncate">{{ place(entry) }}</span>
                <span
                  v-if="entry.outdated"
                  class="size-2 rounded-full bg-apricot"
                  :title="OUTDATED_HINT"
                />
                <span class="text-micro shrink-0 text-ink-muted uppercase group-aria-pressed:text-white/80">{{ detail(entry) }}</span>
              </button>
            </li>
          </ul>
        </div>

        <p
          v-if="detailError"
          class="font-body text-caption text-error"
          role="alert"
        >
          {{ detailError }}
        </p>
      </template>

      <!-- E · Popup, as a fourth way to set the starting point -->
      <template #origin-actions>
        <div
          v-if="variant === 'E' && items.length"
          ref="popupRoot"
          class="relative"
        >
          <button
            type="button"
            class="font-display text-btn cursor-pointer uppercase transition-colors hover:text-coral pointer-coarse:min-h-11"
            :class="popupOpen || selected ? 'text-coral' : 'text-ink-muted'"
            :aria-expanded="popupOpen"
            aria-haspopup="menu"
            @click.stop="popupOpen = !popupOpen"
          >
            <span aria-hidden="true">★</span> Saved ({{ items.length }}) ▾
          </button>
          <div
            v-if="popupOpen"
            role="menu"
            class="absolute right-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-(--radius-box) border border-border bg-white shadow-lg"
          >
            <p class="font-body text-micro border-b border-border px-3 py-2 text-ink-muted italic uppercase">
              Start from a saved splash zone
            </p>
            <button
              v-for="entry in items"
              :key="entry.id"
              type="button"
              role="menuitemradio"
              :aria-checked="selectedId === entry.id"
              class="font-body flex w-full cursor-pointer flex-col px-3 py-2 text-left text-[14px] text-ink hover:bg-coral/10 aria-checked:bg-coral/15"
              @click="choose(entry)"
            >
              <span class="flex items-center gap-1.5">
                <span
                  v-if="selectedId === entry.id"
                  aria-hidden="true"
                  class="text-coral"
                >✓</span>
                {{ place(entry) }}
                <span
                  v-if="entry.outdated"
                  class="font-display text-micro rounded-(--radius-field) border border-apricot bg-apricot/15 px-1 uppercase"
                  :title="OUTDATED_HINT"
                >Out of date</span>
              </span>
              <span class="text-micro text-ink-muted uppercase">{{ detail(entry) }}</span>
            </button>
          </div>
        </div>
      </template>
    </IsochroneForm>
  </section>
</template>
