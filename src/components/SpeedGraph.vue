<script setup lang="ts">
</script>

<template>
  <section
    class="speed-graph"
    data-testid="speed-graph"
    aria-label="Speed and acceleration"
  >
    <h2 class="speed-graph__title">
      Speed / acceleration
    </h2>
    <div class="speed-graph__panel">
      <p class="t-lead speed-graph__lead">
        Speed and acceleration profiles will appear here.
      </p>
      <p class="t-caption">
        This visualization is coming from the Speed / Acceleration Graph project.
      </p>
    </div>
  </section>
</template>

<style scoped>
.speed-graph {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.speed-graph__title {
  margin: 0;
}

.speed-graph__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 180px;
  padding: 1.5rem;
  border: 1px dashed var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  text-align: center;
}

.speed-graph__lead {
  margin: 0;
  color: var(--color-ink);
}
</style>
