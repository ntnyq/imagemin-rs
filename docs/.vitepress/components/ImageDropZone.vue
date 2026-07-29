<script setup lang="ts">
import { useDropZone, useFileDialog } from "@vueuse/core";
import { ref } from "vue";

import type { PlaygroundCopy } from "../playground/types";

defineProps<{
  copy: PlaygroundCopy;
  disabled: boolean;
}>();

const emit = defineEmits<{
  files: [files: File[] | FileList | null];
}>();

const dropZone = ref<HTMLButtonElement>();
const { open, onChange } = useFileDialog({
  accept: "image/png,image/jpeg,image/webp",
  multiple: true,
  reset: true,
});

onChange((files) => emit("files", files));

const { isOverDropZone } = useDropZone(dropZone, {
  onDrop: (files) => emit("files", files),
});
</script>

<template>
  <button
    ref="dropZone"
    class="drop-zone"
    :class="{ 'is-active': isOverDropZone }"
    :disabled="disabled"
    type="button"
    @click="open()"
  >
    <span class="drop-zone__mark" aria-hidden="true">+</span>
    <span class="drop-zone__label">
      {{ isOverDropZone ? copy.dropActive : copy.dropLabel }}
    </span>
    <span class="drop-zone__hint">{{ copy.dropHint }}</span>
  </button>
</template>

<style scoped>
.drop-zone {
  display: grid;
  min-height: 188px;
  width: 100%;
  place-content: center;
  gap: 10px;
  border: 1px dashed var(--lab-line-strong);
  border-radius: 3px;
  background:
    linear-gradient(var(--lab-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--lab-grid) 1px, transparent 1px), var(--lab-surface);
  background-size: 24px 24px;
  color: var(--lab-ink);
  cursor: pointer;
  text-align: center;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 160ms ease;
}

.drop-zone:hover,
.drop-zone:focus-visible,
.drop-zone.is-active {
  border-color: var(--lab-accent);
  background-color: var(--lab-accent-soft);
  outline: none;
}

.drop-zone.is-active {
  transform: translateY(-2px);
}

.drop-zone:disabled {
  cursor: wait;
  opacity: 0.6;
}

.drop-zone__mark {
  display: grid;
  width: 38px;
  height: 38px;
  margin: 0 auto 2px;
  place-items: center;
  border: 1px solid var(--lab-ink);
  border-radius: 50%;
  font-family: var(--lab-mono);
  font-size: 24px;
  line-height: 1;
}

.drop-zone__label {
  font-size: 17px;
  font-weight: 680;
}

.drop-zone__hint {
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .drop-zone {
    transition: none;
  }
}
</style>
