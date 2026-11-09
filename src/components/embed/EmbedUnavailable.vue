<script setup lang="ts">
import { PRIMARY_BUTTON_CLASS } from '../buttonStyles'

const home = `${window.location.origin}/`
</script>

<template>
  <!-- One wording for unknown and unpublished alike, as on the full page:
       saying which would tell a stranger a draft sits behind a guessed slug.
       The link leaves the frame, so the site never loads inside someone's post. -->
  <div class="flex h-full items-center justify-center p-4">
    <div
      class="flex max-w-[320px] flex-col items-start gap-3 rounded-(--radius-box) border border-border bg-surface p-4 shadow-(--shadow-panel)"
      data-testid="embed-unavailable"
    >
      <p class="t-subhead text-ink-true">
        This splash zone isn’t available.
      </p>
      <p class="t-note text-ink-muted">
        It may have been taken down, or the link may be mistyped.
      </p>
      <a
        :href="home"
        target="_blank"
        rel="noopener"
        :class="PRIMARY_BUTTON_CLASS"
      >
        Go to Sparks Effect
      </a>
    </div>
  </div>
</template>
