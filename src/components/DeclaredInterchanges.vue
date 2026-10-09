<script setup lang="ts">
import { computed, ref } from 'vue'
import { interchangePairKey } from '../api/authoring/scenarioInput'
import type { InterchangePair, Service } from '../api/authoring/types'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { resolveStop } from './interchangeStops'

const props = defineProps<{
  pairs: InterchangePair[]
  memberIds: string[]
  services: Pick<Service, 'id' | 'name' | 'stops'>[]
  busy: boolean
  error?: string
}>()

defineEmits<{ remove: [pair: InterchangePair] }>()

const rows = computed(() =>
  props.pairs.map((pair) => {
    const a = resolveStop(pair.a, props.memberIds, props.services)
    const b = resolveStop(pair.b, props.memberIds, props.services)
    return { pair, key: interchangePairKey(pair), a: a.label, b: b.label, missing: a.missing || b.missing }
  }),
)

const heading = ref<HTMLElement | null>(null)

// Where focus goes once a join or removal has finished, since the button that
// started it has usually gone with its row. False when there is no list left.
function focusHeading(): boolean {
  if (!heading.value) return false
  heading.value.focus()
  return true
}

defineExpose({ focusHeading })
</script>

<template>
  <p
    v-if="props.error"
    class="font-body text-caption text-error"
    role="alert"
    data-testid="interchange-error"
  >
    {{ props.error }}
  </p>
  <section
    v-if="rows.length"
    class="rounded-(--radius-box) border border-border bg-surface p-4"
    data-testid="declared-interchanges"
  >
    <h2
      ref="heading"
      tabindex="-1"
      class="font-display text-h3 text-ink-true"
      data-testid="declared-interchanges-heading"
    >
      Declared interchanges
    </h2>
    <ul class="mt-3 flex flex-col gap-2">
      <li
        v-for="row in rows"
        :key="row.key"
        class="font-body text-caption flex items-start justify-between gap-3 text-ink"
        data-testid="declared-interchange-row"
      >
        <span>
          {{ row.a }} and {{ row.b }}
          <span
            v-if="row.missing"
            class="text-ink-muted italic"
            data-testid="declared-interchange-missing"
          >— no longer in this network</span>
        </span>
        <button
          type="button"
          :class="SECONDARY_BUTTON_CLASS"
          :disabled="props.busy"
          :aria-label="`Remove interchange ${row.a} and ${row.b}`"
          data-testid="remove-interchange"
          @click="$emit('remove', row.pair)"
        >
          Remove
        </button>
      </li>
    </ul>
  </section>
</template>
