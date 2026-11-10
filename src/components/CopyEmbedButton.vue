<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from '../composables/useToast'
import { embedSnippet, type EmbedTarget } from '../embed/embedLinks'
import { SECONDARY_BUTTON_CLASS } from './buttonStyles'
import { copyText } from './clipboard'

const props = defineProps<{ target: EmbedTarget; name: string }>()

const route = useRoute()
const { show: toast } = useToast()
const open = ref(false)
const optionsId = useId()

// The snippet points at the host it was copied on, so staging's snippets
// frame staging. Each one carries whatever plot the page's URL names.
const options = computed(() =>
  ([
    { key: 'map-only', label: 'Map only', controls: false },
    { key: 'controls', label: 'With controls', controls: true },
  ] as const).map((option) => ({
    ...option,
    snippet: embedSnippet({
      origin: window.location.origin,
      target: props.target,
      name: props.name,
      query: route.query,
      controls: option.controls,
    }),
  })),
)

async function copy(snippet: string): Promise<void> {
  if (await copyText(snippet)) toast('Embed code copied')
  else toast("Couldn't copy the embed code. Select it above and copy it by hand.", { kind: 'error' })
}
</script>

<template>
  <!-- contents: the toggle sits in its parent's row beside "Copy link", and
       the snippets take a row of their own beneath both. -->
  <div class="contents">
    <button
      type="button"
      :class="SECONDARY_BUTTON_CLASS"
      :aria-expanded="open"
      :aria-controls="optionsId"
      data-testid="copy-embed"
      @click="open = !open"
    >
      Copy embed code
    </button>
    <div
      v-if="open"
      :id="optionsId"
      class="flex w-full flex-col gap-3 rounded-(--radius-box) border border-border bg-white p-3"
      data-testid="copy-embed-options"
    >
      <div
        v-for="option in options"
        :key="option.key"
        class="flex flex-col gap-1.5"
        data-testid="copy-embed-option"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            :id="`${optionsId}-${option.key}`"
            class="t-eyebrow text-ink-muted"
            data-testid="copy-embed-label"
          >{{ option.label }}</span>
          <button
            type="button"
            :class="SECONDARY_BUTTON_CLASS"
            :aria-describedby="`${optionsId}-${option.key}`"
            :data-testid="`copy-embed-${option.key}`"
            @click="copy(option.snippet)"
          >
            Copy
          </button>
        </div>
        <pre
          class="t-meta overflow-x-auto rounded-(--radius-field) bg-surface p-2 break-all whitespace-pre-wrap text-ink"
          :aria-labelledby="`${optionsId}-${option.key}`"
        >{{ option.snippet }}</pre>
      </div>
      <p class="t-note text-ink-muted">
        Transit splash zones make better embeds than walking ones, which stretch along the whole line.
      </p>
    </div>
  </div>
</template>
