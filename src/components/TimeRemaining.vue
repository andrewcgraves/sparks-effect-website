<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import TooltipPanel from './TooltipPanel.vue'
import { formatDuration, formatProgressPercent, formatTimeRemaining, laneWidthFor } from './timeRemaining'
import type { TimeRemainingRow, TimeRemainingView } from './timeRemaining'

const props = defineProps<{
  views: TimeRemainingView[]
  activeSlug: string | null
  activeFromMap?: boolean
}>()

const emit = defineEmits<{ activate: [slug: string | null] }>()

const NODE_BAND_PX = 26

const chosen = ref(0)
const view = computed(() => props.views[chosen.value] ?? props.views[0])
const rows = computed(() => view.value?.rows ?? [])

const laneWidth = computed(() => laneWidthFor(view.value?.laneCount ?? 1))
const graphWidth = computed(() => Math.max(view.value?.laneCount ?? 1, 1) * laneWidth.value)
const laneX = (lane: number): number => lane * laneWidth.value + laneWidth.value / 2

const listEl = ref<HTMLElement | null>(null)

watch(() => props.views, () => { chosen.value = 0 }, { immediate: true })

function forkBarStyle(row: TimeRemainingRow): Record<string, string> {
  const xs = row.forks.map(laneX)
  const left = Math.min(...xs)
  return {
    left: `${left}px`,
    width: `${Math.max(...xs) - left}px`,
    top: `${NODE_BAND_PX / 2}px`,
  }
}

function isExpanded(row: TimeRemainingRow): boolean {
  return row.slug !== null && row.slug === props.activeSlug
}

function hasDetail(row: TimeRemainingRow): boolean {
  return Object.values(row.detail).some((value) => value !== undefined)
}

const labels = computed(() => new Map(rows.value.map((row) => [row.key, row.label])))

function rideTerm(row: TimeRemainingRow): string {
  const from = row.parentKey === null ? undefined : labels.value.get(row.parentKey)
  return from ? `Rode in from ${from}` : 'Rode in'
}

const anchor = ref<Element | null>(null)

function setAnchor(el?: Element | null): void {
  if (el) anchor.value = el
}

function activate(row: TimeRemainingRow, event: Event): void {
  setAnchor(event.currentTarget as Element | null)
  emit('activate', row.slug)
}

function reveal(row: Element): void {
  const list = listEl.value
  if (!list) return
  const listRect = list.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top
  else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom
}

watch(
  () => [props.activeSlug, props.activeFromMap] as const,
  async ([slug, fromMap]) => {
    if (!slug || !fromMap) return
    const showing = props.views[chosen.value]
    if (!showing?.rows.some((row) => row.slug === slug)) {
      const found = props.views.findIndex((candidate) => candidate.rows.some((row) => row.slug === slug))
      if (found >= 0) chosen.value = found
    }
    await nextTick()
    // Matched in script rather than through a selector, because a slug is the
    // graph's own key and nothing promises it is safe to interpolate into one.
    const rows = listEl.value?.querySelectorAll('[data-station-slug]') ?? []
    for (const row of rows) {
      if (row.getAttribute('data-station-slug') === slug) {
        reveal(row)
        // Measured after the scroll, so the box lands beside where the row
        // ended up rather than where it started.
        setAnchor(row)
        return
      }
    }
  },
)
</script>

<template>
  <section
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="time-remaining"
  >
    <h2 class="font-display text-h3 text-ink-true">
      Time remaining
    </h2>

    
    <SegmentedControl
      v-if="props.views.length > 1"
      v-model="chosen"
      class="mt-3"
      :options="props.views.map((_, index) => index)"
      :format-option="(index: number) => props.views[index].label"
      name="time-remaining-service"
      testid="time-remaining-service"
    />

    <ul
      ref="listEl"
      class="mt-3 flex max-h-[26rem] list-none flex-col overflow-y-auto p-0"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex cursor-default items-stretch gap-3 rounded-(--radius-field) focus:outline-none focus-visible:ring-1 focus-visible:ring-coral"
        :class="isExpanded(row) ? 'bg-white' : ''"
        tabindex="0"
        :data-station-slug="row.slug ?? undefined"
        data-testid="time-remaining-row"
        @mouseenter="activate(row, $event)"
        @mouseleave="emit('activate', null)"
        @focus="activate(row, $event)"
        @blur="emit('activate', null)"
      >
        
        <div
          class="relative shrink-0"
          :style="{ width: `${graphWidth}px` }"
        >
          <span
            v-for="lane in row.through"
            :key="`through-${lane}`"
            class="absolute w-px bg-border"
            :style="{ left: `${laneX(lane)}px`, top: '0', bottom: '0' }"
          />
          <span
            v-if="row.incoming"
            class="absolute w-px bg-border"
            :style="{ left: `${laneX(row.lane)}px`, top: '0', height: `${NODE_BAND_PX / 2}px` }"
          />
          
          <span
            v-if="row.forks.length > 1"
            class="absolute h-px bg-border"
            :style="forkBarStyle(row)"
          />
          
          <span
            v-for="lane in row.forks"
            :key="`fork-${lane}`"
            class="absolute w-px bg-border"
            :style="{ left: `${laneX(lane)}px`, top: `${NODE_BAND_PX / 2}px`, bottom: '0' }"
          />
          <span
            class="absolute size-1.5 rounded-full bg-ink-muted"
            :style="{ left: `${laneX(row.lane) - 3}px`, top: `${NODE_BAND_PX / 2 - 3}px` }"
            data-testid="time-remaining-node"
          />
        </div>

        <div class="min-w-0 flex-1 py-1">
          <p class="font-body text-caption truncate text-ink">
            {{ row.label }}
          </p>
          <p
            v-if="row.flag"
            class="font-body text-micro text-ink-muted uppercase"
            data-testid="time-remaining-flag"
          >
            {{ row.flag }}
          </p>
        </div>

        <p
          class="font-body text-caption shrink-0 py-1 text-right tabular-nums text-ink-true"
          data-testid="time-remaining-value"
        >
          {{ formatTimeRemaining(row.remainingSecs) }}
        </p>

        
        <TooltipPanel
          v-if="isExpanded(row) && hasDetail(row)"
          :open="true"
          :anchor="anchor"
        >
          <dl
            class="font-body text-micro flex flex-col gap-0.5 text-ink-muted"
            data-testid="time-remaining-detail"
          >
            
            <div v-if="row.detail.accessTo">
              <dt class="inline">
                {{ row.flag }} to {{ row.detail.accessTo }}
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.accessSecs ?? 0) }}
              </dd>
            </div>
            <div v-if="row.detail.rideSecs !== undefined">
              <dt class="inline">
                {{ rideTerm(row) }}
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.rideSecs) }}
              </dd>
            </div>
            <div v-if="row.detail.arrivalSecs !== undefined">
              <dt class="inline">
                Arrived with
              </dt>
              <dd class="ml-1 inline">
                {{ formatTimeRemaining(row.detail.arrivalSecs) }} left
              </dd>
            </div>
            <div v-if="row.detail.dwellSecs !== undefined">
              <dt class="inline">
                Stopped here for
              </dt>
              <dd class="ml-1 inline">
                {{ formatDuration(row.detail.dwellSecs) }}
              </dd>
            </div>
            <div v-if="row.detail.transferFrom">
              <dt class="inline">
                Changed from
              </dt>
              <dd class="ml-1 inline">
                {{ row.detail.transferFrom }}
              </dd>
            </div>
            
            <div v-if="row.detail.progressTo && row.detail.progressFraction !== undefined">
              <dt class="inline">
                Got {{ formatProgressPercent(row.detail.progressFraction) }} of the way toward
              </dt>
              <dd class="ml-1 inline">
                {{ row.detail.progressTo }}
              </dd>
            </div>
          </dl>
        </TooltipPanel>
      </li>
    </ul>
  </section>
</template>
