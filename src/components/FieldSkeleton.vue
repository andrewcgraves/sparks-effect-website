<script setup lang="ts">
import SkeletonShape from './SkeletonShape.vue'

const props = withDefaults(defineProps<{ rows?: number }>(), { rows: 1 })
</script>

<template>
  <div
    class="font-body text-micro flex flex-col gap-1"
    data-testid="field-skeleton"
  >
    <SkeletonShape class="w-24" />
    <!-- A field is `rows` lines of 14px text plus py-1.5 and a 1px border. -->
    <SkeletonShape
      shape="block"
      class="rounded-(--radius-field) text-[14px]"
      :style="{ height: `calc(${props.rows}lh + 14px)` }"
    />
  </div>
</template>
