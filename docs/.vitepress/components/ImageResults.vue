<script setup lang="ts">
import type { PlaygroundCopy, PlaygroundItem } from "../playground/types";
import ImageResultCard from "./ImageResultCard.vue";

defineProps<{
  copy: PlaygroundCopy;
  disabled: boolean;
  items: PlaygroundItem[];
}>();

const emit = defineEmits<{
  download: [item: PlaygroundItem];
  remove: [id: string];
}>();
</script>

<template>
  <section class="results" aria-live="polite">
    <div class="results__heading">
      <h3>{{ copy.results }}</h3>
      <span>{{ items.length }} {{ copy.selected }}</span>
    </div>

    <div v-if="items.length" class="results__list">
      <ImageResultCard
        v-for="item in items"
        :key="item.id"
        :copy="copy"
        :disabled="disabled"
        :item="item"
        @download="emit('download', $event)"
        @remove="emit('remove', $event)"
      />
    </div>
    <p v-else class="results__empty">{{ copy.empty }}</p>
  </section>
</template>

<style scoped>
.results {
  min-width: 0;
}

.results__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.results__heading h3 {
  margin: 0;
  border: 0;
  color: var(--lab-ink);
  font-size: 15px;
}

.results__heading span {
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 11px;
  text-transform: uppercase;
}

.results__list {
  display: grid;
  gap: 12px;
}

.results__empty {
  display: grid;
  min-height: 180px;
  margin: 0;
  place-items: center;
  border: 1px solid var(--lab-line);
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 12px;
}
</style>
