<script setup lang="ts">
import { computed } from 'vue'
import type { InterchangePair, Service, StopIdentity } from '../api/authoring/types'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'

const props = defineProps<{
  pairs: InterchangePair[]
  memberIds: string[]
  services: Pick<Service, 'id' | 'name' | 'stops'>[]
  busy: boolean
  error?: string
}>()

defineEmits<{ remove: [pair: InterchangePair] }>()

// A pair names its stops by slug alone, so it outlives a stop deleted from its
// line, and one set through the API can name a line this page has no record
// of. It is still listed, by whatever is left of its name, so the author can
// remove it — the compile refuses a pair naming a stop that is gone.
function resolveStop(stop: StopIdentity): { label: string; missing: boolean } {
  const service = props.services.find((candidate) => candidate.id === stop.service_id)
  const named = service?.stops.find((candidate) => candidate.slug === stop.slug)
  return {
    label: `${named?.name ?? stop.slug} (${service?.name ?? stop.service_id})`,
    missing: !props.memberIds.includes(stop.service_id) || Boolean(service && !named),
  }
}

const rows = computed(() =>
  props.pairs.map((pair) => {
    const a = resolveStop(pair.a)
    const b = resolveStop(pair.b)
    return { pair, a: a.label, b: b.label, missing: a.missing || b.missing }
  }),
)
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
    <h2 class="font-display text-h3 text-ink-true">
      Declared interchanges
    </h2>
    <ul class="mt-3 flex flex-col gap-2">
      <li
        v-for="(row, index) in rows"
        :key="index"
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
          data-testid="remove-interchange"
          @click="$emit('remove', row.pair)"
        >
          Remove
        </button>
      </li>
    </ul>
  </section>
</template>
