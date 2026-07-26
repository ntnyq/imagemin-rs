import { optimizeFiles } from "./files";
import { optimize } from "./optimize";
import type { Imagemin, OptimizeOptions } from "./types";

const imagemin: Imagemin = Object.assign(optimizeFiles, {
  async buffer(input: Uint8Array, options?: OptimizeOptions) {
    return (await optimize(input, options)).data;
  },
});

export default imagemin;

export { avif } from "./avif";
export { ImageminError } from "./errors";
export { gifsicle } from "./gifsicle";
export { giflossless, optipng, oxipng, svgm } from "./native-plugin";
export { jpegtran } from "./jpegtran";
export { mozjpeg } from "./mozjpeg";
export { optimize };
export { pngquant } from "./pngquant";
export { svgo } from "./svgo";
export { webp } from "./webp";
export type {
  AvifChromaSubsampling,
  AvifOptions,
  ImageFormat,
  GifsicleOptions,
  GiflosslessOptions,
  Imagemin,
  ImageminOptions,
  ImageminPlugin,
  ImageminPluginContext,
  ImageminResult,
  JpegtranOptions,
  MozjpegOptions,
  OptimizationResult,
  OptimizationStep,
  OptimizeOptions,
  OptipngOptions,
  OxipngOptions,
  PngquantOptions,
  StripMode,
  SvgmOptions,
  SvgmPassName,
  SvgmPreset,
  SvgoOptions,
  WebpCropOptions,
  WebpMetadata,
  WebpOptions,
  WebpPreset,
  WebpResizeOptions,
} from "./types";
