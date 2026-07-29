export { ImageminError } from "./errors";
export type { ImageminErrorCode } from "./errors";
export { optimize } from "./optimize";
export { giflossless, optipng, oxipng, svgm } from "./plugins";
export { initWasm, isWasmInitialized } from "./runtime";
export type {
  GiflosslessOptions,
  ImageFormat,
  ImageminPlugin,
  ImageminPluginContext,
  MaybePromise,
  OptimizationResult,
  OptimizationStep,
  OptimizeOptions,
  OptipngOptions,
  OxipngOptions,
  StripMode,
  SvgmOptions,
  SvgmPassName,
  SvgmPreset,
  WasmInitInput,
} from "./types";
