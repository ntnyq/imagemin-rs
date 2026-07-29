<script setup lang="ts">
import { computed } from "vue";

import type { OutputFormat, PlaygroundCopy, PlaygroundOptions } from "../playground/types";

const props = defineProps<{
  copy: PlaygroundCopy;
  disabled: boolean;
  options: PlaygroundOptions;
}>();

const emit = defineEmits<{
  change: [options: Partial<PlaygroundOptions>];
}>();

const qualityDisabled = computed(() => props.options.format === "image/png");
const keepSmallerDisabled = computed(() => props.options.format !== "auto");

function numberValue(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}
</script>

<template>
  <fieldset class="controls" :disabled="disabled">
    <legend>{{ copy.summary }}</legend>

    <label class="control control--format">
      <span>{{ copy.format }}</span>
      <select
        :value="options.format"
        @change="
          emit('change', {
            format: ($event.target as HTMLSelectElement).value as OutputFormat,
          })
        "
      >
        <option value="auto">{{ copy.autoFormat }}</option>
        <option value="image/webp">{{ copy.webpFormat }}</option>
        <option value="image/jpeg">{{ copy.jpegFormat }}</option>
        <option value="image/png">{{ copy.pngFormat }}</option>
      </select>
    </label>

    <label class="control control--quality" :class="{ 'is-disabled': qualityDisabled }">
      <span>{{ copy.quality }}</span>
      <output>{{ options.quality }}</output>
      <input
        :disabled="qualityDisabled"
        max="100"
        min="1"
        :value="options.quality"
        type="range"
        @input="emit('change', { quality: numberValue($event) })"
      />
    </label>

    <label class="control">
      <span>{{ copy.maxWidth }}</span>
      <input
        inputmode="numeric"
        max="16384"
        min="0"
        :value="options.maxWidth"
        type="number"
        @change="emit('change', { maxWidth: numberValue($event) })"
      />
      <small>{{ copy.noLimit }}</small>
    </label>

    <label class="control">
      <span>{{ copy.maxHeight }}</span>
      <input
        inputmode="numeric"
        max="16384"
        min="0"
        :value="options.maxHeight"
        type="number"
        @change="emit('change', { maxHeight: numberValue($event) })"
      />
      <small>{{ copy.noLimit }}</small>
    </label>

    <label class="check" :class="{ 'is-disabled': keepSmallerDisabled }">
      <input
        :checked="options.keepSmaller"
        :disabled="keepSmallerDisabled"
        type="checkbox"
        @change="
          emit('change', {
            keepSmaller: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span>{{ copy.keepSmaller }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px 20px;
  margin: 0;
  padding: 22px;
  border: 1px solid var(--lab-line);
  border-radius: 3px;
  background: var(--lab-surface);
}

legend {
  padding: 0 8px;
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.control {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px 12px;
  color: var(--lab-ink);
  font-size: 13px;
  font-weight: 650;
}

.control input,
.control select {
  grid-column: 1 / -1;
  min-height: 38px;
  padding: 7px 10px;
  border: 1px solid var(--lab-line-strong);
  border-radius: 2px;
  background: var(--lab-canvas);
  color: var(--lab-ink);
  font: inherit;
}

.control input:focus,
.control select:focus {
  border-color: var(--lab-accent);
  outline: 2px solid var(--lab-accent-soft);
  outline-offset: 1px;
}

.control input[type="range"] {
  min-height: auto;
  padding: 0;
  accent-color: var(--lab-accent);
}

.control output,
.control small {
  color: var(--lab-muted);
  font-family: var(--lab-mono);
  font-size: 11px;
  font-weight: 500;
}

.control small {
  grid-column: 1 / -1;
}

.is-disabled {
  opacity: 0.5;
}

.check {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  color: var(--lab-ink);
  cursor: pointer;
  font-size: 13px;
}

.check input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--lab-accent);
}

@media (max-width: 640px) {
  .controls {
    grid-template-columns: 1fr;
    padding: 18px;
  }
}
</style>
