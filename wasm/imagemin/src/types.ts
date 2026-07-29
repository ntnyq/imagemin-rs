export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif" | "svg" | "unknown";

export type MaybePromise<Value> = Value | PromiseLike<Value>;

export type WasmInitInput = BufferSource | RequestInfo | Response | URL | WebAssembly.Module;

export interface ImageminPluginContext {
  signal?: AbortSignal;
}

export type ImageminPlugin = (
  input: Uint8Array,
  context?: Readonly<ImageminPluginContext>,
) => MaybePromise<Uint8Array>;

export type StripMode = "none" | "safe" | "all";

export interface OxipngOptions {
  optimizationLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  strip?: StripMode;
  optimizeAlpha?: boolean;
  interlace?: boolean;
}

export interface OptipngOptions {
  optimizationLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  bitDepthReduction?: boolean;
  colorTypeReduction?: boolean;
  paletteReduction?: boolean;
  interlaced?: boolean | null;
  errorRecovery?: boolean;
}

export interface GiflosslessOptions {
  strip?: boolean;
}

export type SvgmPreset = "safe" | "default";

export type SvgmPassName =
  | "removeDoctype"
  | "removeProcInst"
  | "removeComments"
  | "removeDeprecatedAttrs"
  | "removeMetadata"
  | "removeEditorData"
  | "removeDesc"
  | "removeEmptyAttrs"
  | "removeEmptyText"
  | "removeHiddenElems"
  | "removeUselessDefs"
  | "removeUselessStrokeAndFill"
  | "removeEmptyContainers"
  | "removeUnusedNamespaces"
  | "cleanupAttrs"
  | "inlineStyles"
  | "minifyStyles"
  | "cleanupNumericValues"
  | "convertColors"
  | "removeUnknownsAndDefaults"
  | "removeNonInheritableGroupAttrs"
  | "cleanupEnableBackground"
  | "convertEllipseToCircle"
  | "convertShapeToPath"
  | "moveElemsAttrsToGroup"
  | "moveGroupAttrsToElems"
  | "convertTransform"
  | "collapseGroups"
  | "cleanupIds"
  | "convertPathData"
  | "mergePaths"
  | "sortAttrs"
  | "sortDefsChildren"
  | "minifyWhitespace";

export interface SvgmOptions {
  preset?: SvgmPreset;
  precision?: number;
  passOverrides?: Partial<Record<SvgmPassName, boolean>>;
}

export interface OptimizeOptions {
  plugins?: readonly ImageminPlugin[];
  signal?: AbortSignal;
}

export interface OptimizationStep {
  plugin: string;
  inputBytes: number;
  outputBytes: number;
  changed: boolean;
}

export interface OptimizationResult {
  data: Uint8Array;
  format: ImageFormat;
  inputBytes: number;
  outputBytes: number;
  steps: OptimizationStep[];
}
