export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif" | "svg" | "unknown";

export type MaybePromise<Value> = Value | PromiseLike<Value>;

export interface ImageminPluginContext {
  /** Cooperative cancellation for built-in and context-aware third-party plugins. */
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

export interface GifsicleOptions {
  interlaced?: boolean;
  optimizationLevel?: 1 | 2 | 3;
  colors?: number;
}

export interface GiflosslessOptions {
  strip?: boolean;
}

export interface PngquantOptions {
  speed?: number;
  strip?: boolean;
  quality?: [number, number];
  dithering?: number | boolean;
  posterize?: number;
}

export interface JpegtranOptions {
  progressive?: boolean;
  arithmetic?: boolean;
}

export interface MozjpegOptions {
  quality?: number;
  progressive?: boolean;
  targa?: boolean;
  revert?: boolean;
  fastCrush?: boolean;
  dcScanOpt?: number;
  trellis?: boolean;
  trellisDC?: boolean;
  tune?: "psnr" | "hvs-psnr" | "ssim" | "ms-ssim";
  overshoot?: boolean;
  arithmetic?: boolean;
  dct?: "int" | "fast" | "float";
  quantBaseline?: boolean;
  quantTable?: number;
  smooth?: number;
  maxMemory?: number;
  sample?: string[];
}

export type WebpPreset = "default" | "photo" | "picture" | "drawing" | "icon" | "text";

export type WebpMetadata = "all" | "none" | "exif" | "icc" | "xmp";

export interface WebpCropOptions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WebpResizeOptions {
  width: number;
  height: number;
}

export interface WebpOptions {
  preset?: WebpPreset;
  quality?: number;
  alphaQuality?: number;
  method?: number;
  size?: number;
  sns?: number;
  filter?: number;
  autoFilter?: boolean;
  sharpness?: number;
  lossless?: boolean | number;
  nearLossless?: number;
  crop?: WebpCropOptions;
  resize?: WebpResizeOptions;
  metadata?: WebpMetadata | WebpMetadata[];
}

export type AvifChromaSubsampling = "4:2:0" | "4:4:4";

export interface AvifOptions {
  /** Output quality from 1 (lowest) to 100 (highest). Defaults to 90. */
  quality?: number;
  /** Use lossless AV1 encoding. Defaults to false. */
  lossless?: boolean;
  /** Sharp/libheif effort from 0 (fastest) to 9 (slowest). */
  effort?: number;
  /** imagemin-avif-compatible speed from 0 (effort 9) to 8 (effort 0). */
  speed?: number;
  /** Chroma subsampling mode. Defaults to 4:2:0. */
  chromaSubsampling?: AvifChromaSubsampling;
  /** The prebuilt Sharp runtime currently supports 8-bit AVIF only. */
  bitdepth?: 8;
}

export type SvgoOptions = SvgoConfig;

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

export interface ImageminOptions extends OptimizeOptions {
  /** Maximum files optimized concurrently. Defaults to min(4, available CPUs). */
  concurrency?: number;
  destination?: string;
  glob?: boolean;
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

export interface ImageminResult extends OptimizationResult {
  sourcePath: string;
  destinationPath?: string;
}

export interface Imagemin {
  (inputs: readonly string[], options?: ImageminOptions): Promise<ImageminResult[]>;

  buffer(input: Uint8Array, options?: OptimizeOptions): Promise<Uint8Array>;
}
import type { Config as SvgoConfig } from "svgo";
