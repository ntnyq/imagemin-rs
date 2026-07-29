<script setup lang="ts">
import { computed } from "vue";

import { playgroundCopies } from "../playground/copy";
import { formatBytes, formatSavings } from "../playground/image";
import type { PlaygroundOptions } from "../playground/types";
import { useImagePlayground } from "../playground/useImagePlayground";
import ImageControls from "./ImageControls.vue";
import ImageDropZone from "./ImageDropZone.vue";
import ImageResults from "./ImageResults.vue";

const props = withDefaults(
  defineProps<{
    locale?: "en" | "zh";
  }>(),
  {
    locale: "en",
  },
);

const copy = computed(() => playgroundCopies[props.locale]);
const playground = useImagePlayground(props.locale);
const savings = computed(() =>
  formatSavings(playground.totalInputBytes.value, playground.totalOutputBytes.value),
);

function updateOptions(update: Partial<PlaygroundOptions>) {
  Object.assign(playground.options, update);
}
</script>

<template>
  <section class="image-lab" aria-labelledby="image-lab-title">
    <header class="image-lab__intro">
      <div>
        <p class="image-lab__eyebrow">IMAGEMIN / LOCAL LAB</p>
        <h2 id="image-lab-title">{{ copy.title }}</h2>
        <p>{{ copy.description }}</p>
      </div>
      <p class="privacy"><span aria-hidden="true">●</span> {{ copy.privacy }}</p>
    </header>

    <ImageDropZone
      :copy="copy"
      :disabled="playground.isProcessing.value"
      @files="playground.addFiles"
    />

    <p v-if="playground.notice.value" class="notice" role="status">
      {{ playground.notice.value }}
    </p>

    <div v-if="playground.items.value.length" class="image-lab__workspace">
      <aside class="image-lab__settings">
        <ImageControls
          :copy="copy"
          :disabled="playground.isProcessing.value"
          :options="playground.options"
          @change="updateOptions"
        />

        <div class="batch-actions">
          <button
            class="button button--primary"
            :disabled="!playground.canOptimize.value"
            type="button"
            @click="playground.processAll"
          >
            {{ playground.isProcessing.value ? copy.optimizing : copy.optimize }}
          </button>
          <button
            class="button"
            :disabled="!playground.canDownloadAll.value"
            type="button"
            @click="playground.downloadAll"
          >
            {{ copy.batchDownload }}
          </button>
          <button
            class="button button--quiet"
            :disabled="playground.isProcessing.value"
            type="button"
            @click="playground.clearItems"
          >
            {{ copy.clear }}
          </button>
        </div>

        <dl v-if="playground.completedItems.value.length" class="batch-meter">
          <div>
            <dt>{{ copy.input }}</dt>
            <dd>{{ formatBytes(playground.totalInputBytes.value) }}</dd>
          </div>
          <div>
            <dt>{{ copy.output }}</dt>
            <dd>{{ formatBytes(playground.totalOutputBytes.value) }}</dd>
          </div>
          <div>
            <dt>{{ copy.saved }}</dt>
            <dd>{{ savings }}</dd>
          </div>
        </dl>
      </aside>

      <ImageResults
        :copy="copy"
        :disabled="playground.isProcessing.value"
        :items="playground.items.value"
        @download="playground.downloadItem"
        @remove="playground.removeItem"
      />
    </div>
  </section>
</template>

<style scoped>
.image-lab {
  --lab-canvas: #f7f8f4;
  --lab-surface: #ffffff;
  --lab-ink: #17201d;
  --lab-muted: #66716c;
  --lab-line: #dce1db;
  --lab-line-strong: #aeb8b1;
  --lab-grid: rgb(49 87 213 / 6%);
  --lab-checker: rgb(23 32 29 / 7%);
  --lab-accent: #3157d5;
  --lab-accent-soft: rgb(49 87 213 / 9%);
  --lab-positive: #16845e;
  --lab-danger: #b94d3b;
  --lab-danger-soft: rgb(185 77 59 / 9%);
  --lab-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  max-width: 1180px;
  margin: 28px auto 48px;
  padding: 26px;
  border: 1px solid var(--lab-line);
  border-radius: 4px;
  background: var(--lab-canvas);
  box-shadow: 0 24px 70px rgb(23 32 29 / 8%);
}

.image-lab__intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 22px;
}

.image-lab__intro h2 {
  margin: 4px 0 6px;
  border: 0;
  color: var(--lab-ink);
  font-size: clamp(26px, 4vw, 42px);
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.image-lab__intro p {
  max-width: 650px;
  margin: 0;
  color: var(--lab-muted);
}

.image-lab__eyebrow {
  color: var(--lab-accent) !important;
  font-family: var(--lab-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.privacy {
  flex: 0 0 auto;
  padding: 8px 10px;
  border: 1px solid var(--lab-line);
  background: var(--lab-surface);
  font-family: var(--lab-mono);
  font-size: 10px;
  white-space: nowrap;
}

.privacy span {
  color: var(--lab-positive);
}

.notice {
  margin: 10px 0 0;
  color: var(--lab-danger);
  font-size: 12px;
}

.image-lab__workspace {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.6fr);
  gap: 24px;
  margin-top: 26px;
}

.image-lab__settings {
  min-width: 0;
}

.batch-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}

.button {
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--lab-line-strong);
  border-radius: 2px;
  background: var(--lab-surface);
  color: var(--lab-ink);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.button:hover:not(:disabled),
.button:focus-visible {
  border-color: var(--lab-accent);
  outline: none;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.button--primary {
  grid-column: 1 / -1;
  border-color: var(--lab-accent);
  background: var(--lab-accent);
  color: #ffffff;
}

.button--quiet {
  background: transparent;
}

.batch-meter {
  display: grid;
  margin: 12px 0 0;
  border: 1px solid var(--lab-line);
  background: var(--lab-surface);
}

.batch-meter div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--lab-line);
}

.batch-meter div:last-child {
  border-bottom: 0;
}

.batch-meter dt,
.batch-meter dd {
  margin: 0;
  font-family: var(--lab-mono);
  font-size: 11px;
}

.batch-meter dt {
  color: var(--lab-muted);
}

.batch-meter dd {
  color: var(--lab-ink);
  font-weight: 700;
}

@media (max-width: 860px) {
  .image-lab {
    padding: 20px;
  }

  .image-lab__intro {
    display: grid;
  }

  .privacy {
    justify-self: start;
  }

  .image-lab__workspace {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .image-lab {
    margin-inline: -16px;
    padding: 16px;
    border-right: 0;
    border-left: 0;
  }
}

:global(.dark) .image-lab {
  --lab-canvas: #111816;
  --lab-surface: #17201d;
  --lab-ink: #edf2ee;
  --lab-muted: #9ca9a2;
  --lab-line: #2c3833;
  --lab-line-strong: #53625b;
  --lab-grid: rgb(124 151 255 / 7%);
  --lab-checker: rgb(255 255 255 / 6%);
  --lab-accent: #8da3ff;
  --lab-accent-soft: rgb(141 163 255 / 12%);
  --lab-positive: #62d5a9;
  --lab-danger: #ff9d8c;
  --lab-danger-soft: rgb(255 157 140 / 10%);
}
</style>
