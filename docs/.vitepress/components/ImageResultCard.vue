<script setup lang="ts">
import { useObjectUrl } from "@vueuse/core";
import { computed } from "vue";

import { formatBytes, formatSavings } from "../playground/image";
import type { PlaygroundCopy, PlaygroundItem } from "../playground/types";

const props = defineProps<{
  copy: PlaygroundCopy;
  disabled: boolean;
  item: PlaygroundItem;
}>();

const emit = defineEmits<{
  download: [item: PlaygroundItem];
  remove: [id: string];
}>();

const inputUrl = useObjectUrl(computed(() => props.item.file));
const outputUrl = useObjectUrl(computed(() => props.item.output?.blob));
const outputRatio = computed(() => {
  if (!props.item.output || props.item.file.size === 0) return 100;
  return Math.min(100, Math.max(4, (props.item.output.blob.size / props.item.file.size) * 100));
});
const engineLabel = computed(() => {
  const engine = props.item.output?.engine;
  if (engine === "wasm") return props.copy.engineWasm;
  if (engine === "canvas-wasm") return props.copy.engineCanvasWasm;
  if (engine === "original") return props.copy.engineOriginal;
  return props.copy.engineCanvas;
});
</script>

<template>
  <article class="result-card" :data-status="item.status">
    <header class="result-card__header">
      <div>
        <p class="result-card__name" :title="item.file.name">{{ item.file.name }}</p>
        <p class="result-card__state">
          <span class="state-dot" aria-hidden="true" />
          <template v-if="item.status === 'processing'">{{ copy.optimizing }}</template>
          <template v-else-if="item.status === 'error'">{{ copy.failed }}</template>
          <template v-else-if="item.status === 'done'">
            {{ formatSavings(item.file.size, item.output?.blob.size ?? 0) }} {{ copy.saved }}
          </template>
          <template v-else>{{ copy.queued }}</template>
        </p>
      </div>

      <div class="result-card__actions">
        <button
          v-if="item.output"
          class="action action--primary"
          type="button"
          @click="emit('download', item)"
        >
          {{ copy.download }}
        </button>
        <button class="action" :disabled="disabled" type="button" @click="emit('remove', item.id)">
          ×
          <span class="sr-only">{{ copy.clear }} {{ item.file.name }}</span>
        </button>
      </div>
    </header>

    <p v-if="item.error" class="result-card__error">{{ item.error }}</p>

    <div class="previews">
      <figure>
        <div class="preview-frame">
          <img :alt="`${copy.input}: ${item.file.name}`" :src="inputUrl" />
        </div>
        <figcaption>
          <span>{{ copy.input }}</span>
          <strong>{{ formatBytes(item.file.size) }}</strong>
          <small v-if="item.output">
            {{ item.output.inputWidth }} × {{ item.output.inputHeight }}
          </small>
        </figcaption>
      </figure>

      <figure>
        <div class="preview-frame preview-frame--output">
          <img v-if="outputUrl" :alt="`${copy.output}: ${item.file.name}`" :src="outputUrl" />
          <span v-else class="preview-placeholder" aria-hidden="true">···</span>
        </div>
        <figcaption>
          <span>{{ copy.output }}</span>
          <strong>{{ item.output ? formatBytes(item.output.blob.size) : "—" }}</strong>
          <small v-if="item.output">{{ item.output.width }} × {{ item.output.height }}</small>
          <small v-if="item.output">{{ copy.engine }}: {{ engineLabel }}</small>
        </figcaption>
      </figure>
    </div>

    <div v-if="item.output" class="size-track" aria-hidden="true">
      <span class="size-track__input" />
      <span class="size-track__output" :style="{ width: `${outputRatio}%` }" />
    </div>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid var(--lab-line);
  border-left: 3px solid var(--lab-line-strong);
  border-radius: 2px;
  background: var(--lab-surface);
  overflow: hidden;
}

.result-card[data-status="done"] {
  border-left-color: var(--lab-positive);
}

.result-card[data-status="error"] {
  border-left-color: var(--lab-danger);
}

.result-card[data-status="processing"] {
  border-left-color: var(--lab-accent);
}

.result-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--lab-line);
}

.result-card__name,
.result-card__state,
figure {
  margin: 0;
}

.result-card__name {
  max-width: 420px;
  overflow: hidden;
  color: var(--lab-ink);
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-card__state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 11px;
}

.state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.result-card[data-status="done"] .state-dot {
  color: var(--lab-positive);
}

.result-card[data-status="error"] .state-dot {
  color: var(--lab-danger);
}

.result-card[data-status="processing"] .state-dot {
  color: var(--lab-accent);
  animation: pulse 900ms ease-in-out infinite alternate;
}

.result-card__actions {
  display: flex;
  gap: 6px;
}

.action {
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid var(--lab-line-strong);
  border-radius: 2px;
  background: transparent;
  color: var(--lab-ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.action:hover,
.action:focus-visible {
  border-color: var(--lab-accent);
  outline: none;
}

.action--primary {
  border-color: var(--lab-accent);
  color: var(--lab-accent);
}

.result-card__error {
  margin: 0;
  padding: 10px 16px;
  background: var(--lab-danger-soft);
  color: var(--lab-danger);
  font-size: 12px;
}

.previews {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

figure:first-child {
  border-right: 1px solid var(--lab-line);
}

.preview-frame {
  display: grid;
  min-height: 170px;
  place-items: center;
  padding: 12px;
  background:
    linear-gradient(45deg, var(--lab-checker) 25%, transparent 25%),
    linear-gradient(-45deg, var(--lab-checker) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--lab-checker) 75%),
    linear-gradient(-45deg, transparent 75%, var(--lab-checker) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.preview-frame img {
  display: block;
  max-height: 220px;
  max-width: 100%;
  object-fit: contain;
}

.preview-placeholder {
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 24px;
  letter-spacing: 0.2em;
}

figcaption {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--lab-line);
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 10px;
  text-transform: uppercase;
}

figcaption strong {
  color: var(--lab-ink);
  font-size: 12px;
}

figcaption small {
  grid-column: 1 / -1;
  font-size: 10px;
}

.size-track {
  position: relative;
  height: 5px;
  background: var(--lab-line);
}

.size-track__input,
.size-track__output {
  position: absolute;
  inset: 0 auto 0 0;
}

.size-track__input {
  width: 100%;
  background: var(--lab-muted);
  opacity: 0.35;
}

.size-track__output {
  background: var(--lab-positive);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes pulse {
  to {
    opacity: 0.25;
  }
}

@media (max-width: 640px) {
  .previews {
    grid-template-columns: 1fr;
  }

  figure:first-child {
    border-right: 0;
    border-bottom: 1px solid var(--lab-line);
  }

  .preview-frame {
    min-height: 140px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .state-dot {
    animation: none !important;
  }
}
</style>
