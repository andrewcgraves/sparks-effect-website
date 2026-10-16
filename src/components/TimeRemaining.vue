<script setup lang="ts">
import { TILE_CLASS, TILE_HEADING_CLASS } from './tileStyles'
import { computed, inject, ref, watch, nextTick, useId } from 'vue'
import SegmentedControl from './SegmentedControl.vue'
import TooltipPanel from './TooltipPanel.vue'
import StationDetail from './StationDetail.vue'
import { formatDuration, formatTimeRemaining, laneWidthFor } from './timeRemaining'
import type { TimeRemainingRow, TimeRemainingView } from './timeRemaining'
import { PHONE_PANEL_SCROLLER, revealWithin } from './phonePanelScroll'

const props = defineProps<{
  views: TimeRemainingView[]
  activeSlug: string | null
  activeFromMap?: boolean
}>()

const emit = defineEmits<{ activate: [slug: string | null] }>()

const headingId = useId()

const NODE_BAND_PX = 26

const chosen = ref(0)
const view = computed(() => props.views[chosen.value] ?? props.views[0])
const rows = computed(() => view.value?.rows ?? [])

const laneWidth = computed(() => laneWidthFor(view.value?.laneCount ?? 1))
const graphWidth = computed(() => Math.max(view.value?.laneCount ?? 1, 1) * laneWidth.value)
const laneX = (lane: number): number => lane * laneWidth.value + laneWidth.value / 2

const listEl = ref<HTMLElement | null>(null)
const panelScroller = inject(PHONE_PANEL_SCROLLER, null)

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

function rodeInFrom(row: TimeRemainingRow): string | null {
  return (row.parentKey === null ? undefined : labels.value.get(row.parentKey)) ?? null
}

const anchor = ref<Element | null>(null)

function setAnchor(el?: Element | null): void {
  if (el) anchor.value = el
}

function activate(row: TimeRemainingRow, event: Event): void {
  setAnchor(event.currentTarget as Element | null)
  emit('activate', row.slug)
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
        revealWithin(panelScroller?.value ?? listEl.value, row)
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
    :class="TILE_CLASS"
    :aria-labelledby="headingId"
    data-testid="time-remaining"
  >
    <h2
      :id="headingId"
      :class="TILE_HEADING_CLASS"
    >
      Time remaining
    </h2>

    
    <SegmentedControl
      v-if="props.views.length > 1"
      v-model="chosen"
      class="mt-3"
      :options="props.views.map((_, index) => index)"
      :format-option="(index: number) => props.views[index].label"
      label="Line"
      name="time-remaining-service"
      testid="time-remaining-service"
    />

    <ul
      ref="listEl"
      class="mt-3 flex list-none flex-col p-0"
      :class="panelScroller ? '' : 'max-h-[26rem] overflow-y-auto'"
    >
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex cursor-default items-stretch gap-3 rounded-(--radius-field) focus-visible:-outline-offset-(--focus-ring-width)"
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
          <p
            v-for="leg in row.detail.access ?? []"
            :key="leg.to"
            class="font-body text-micro text-ink-muted"
            data-testid="time-remaining-access"
          >
            {{ leg.flag ? `${leg.flag} to` : 'to' }} {{ leg.to }}, {{ formatDuration(leg.secs) }}
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
          <StationDetail
            :detail="row.detail"
            :rode-in-from="rodeInFrom(row)"
          />
        </TooltipPanel>
      </li>
    </ul>
  </section>
</template>
