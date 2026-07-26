import { ImageminError, throwIfAborted, withAbortSignal } from "./errors";
import { type NativePluginDescriptor, runNativePlugins } from "./native";
import type {
  ImageminPlugin,
  GiflosslessOptions,
  OptipngOptions,
  OxipngOptions,
  StripMode,
  SvgmOptions,
  SvgmPassName,
  SvgmPreset,
} from "./types";

const nativeDescriptors = new WeakMap<ImageminPlugin, NativePluginDescriptor>();

const GIFLOSSLESS_OPTION_NAMES = new Set(["strip"]);

const OXIPNG_OPTION_NAMES = new Set(["interlace", "optimizationLevel", "optimizeAlpha", "strip"]);
const STRIP_MODES = new Set<StripMode>(["none", "safe", "all"]);

const OPTIPNG_OPTION_NAMES = new Set([
  "bitDepthReduction",
  "colorTypeReduction",
  "errorRecovery",
  "interlaced",
  "optimizationLevel",
  "paletteReduction",
]);

const SVGM_OPTION_NAMES = new Set(["passOverrides", "precision", "preset"]);
const SVGM_PRESETS = new Set<SvgmPreset>(["safe", "default"]);
const SVGM_PASS_NAMES = new Set<SvgmPassName>([
  "removeDoctype",
  "removeProcInst",
  "removeComments",
  "removeDeprecatedAttrs",
  "removeMetadata",
  "removeEditorData",
  "removeDesc",
  "removeEmptyAttrs",
  "removeEmptyText",
  "removeHiddenElems",
  "removeUselessDefs",
  "removeUselessStrokeAndFill",
  "removeEmptyContainers",
  "removeUnusedNamespaces",
  "cleanupAttrs",
  "inlineStyles",
  "minifyStyles",
  "cleanupNumericValues",
  "convertColors",
  "removeUnknownsAndDefaults",
  "removeNonInheritableGroupAttrs",
  "cleanupEnableBackground",
  "convertEllipseToCircle",
  "convertShapeToPath",
  "moveElemsAttrsToGroup",
  "moveGroupAttrsToElems",
  "convertTransform",
  "collapseGroups",
  "cleanupIds",
  "convertPathData",
  "mergePaths",
  "sortAttrs",
  "sortDefsChildren",
  "minifyWhitespace",
]);

export function oxipng(options: OxipngOptions = {}): ImageminPlugin {
  return createNativePlugin("oxipng", normalizeOxipngOptions(options));
}

export function giflossless(options: GiflosslessOptions = {}): ImageminPlugin {
  return createNativePlugin("giflossless", normalizeGiflosslessOptions(options));
}

export function optipng(options: OptipngOptions = {}): ImageminPlugin {
  return createNativePlugin("optipng", normalizeOptipngOptions(options));
}

export function svgm(options: SvgmOptions = {}): ImageminPlugin {
  return createNativePlugin("svgm", normalizeSvgmOptions(options));
}

function createNativePlugin(name: string, options: object): ImageminPlugin {
  const descriptor: NativePluginDescriptor = {
    name,
    optionsJson: JSON.stringify(options),
  };
  const plugin: ImageminPlugin = async (input, context) => {
    throwIfAborted(context?.signal, { plugin: name });
    const result = await withAbortSignal(
      runNativePlugins(new Uint8Array(input), [descriptor]),
      context?.signal,
      { plugin: name },
    );

    return result.data;
  };

  Object.defineProperty(plugin, "name", { value: name });
  nativeDescriptors.set(plugin, descriptor);

  return plugin;
}

function normalizeGiflosslessOptions(options: GiflosslessOptions): Required<GiflosslessOptions> {
  for (const optionName of Object.keys(options)) {
    if (!GIFLOSSLESS_OPTION_NAMES.has(optionName)) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_OPTIONS",
        `Unknown giflossless option \`${optionName}\``,
        { plugin: "giflossless" },
      );
    }
  }

  const strip = options.strip ?? false;
  assertBoolean(strip, "strip", "giflossless");

  return { strip };
}

export function getNativeDescriptor(plugin: ImageminPlugin): NativePluginDescriptor | undefined {
  return nativeDescriptors.get(plugin);
}

function normalizeOxipngOptions(
  options: OxipngOptions,
): Required<Pick<OxipngOptions, "optimizationLevel" | "strip">> &
  Pick<OxipngOptions, "interlace" | "optimizeAlpha"> {
  for (const optionName of Object.keys(options)) {
    if (!OXIPNG_OPTION_NAMES.has(optionName)) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_OPTIONS",
        `Unknown oxipng option \`${optionName}\``,
        { plugin: "oxipng" },
      );
    }
  }

  const optimizationLevel = options.optimizationLevel ?? 2;
  if (!Number.isInteger(optimizationLevel) || optimizationLevel < 0 || optimizationLevel > 6) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_OPTIONS",
      "`optimizationLevel` must be an integer between 0 and 6",
      { plugin: "oxipng" },
    );
  }

  const strip = options.strip ?? "safe";
  if (!STRIP_MODES.has(strip)) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_OPTIONS",
      '`strip` must be "none", "safe", or "all"',
      { plugin: "oxipng" },
    );
  }

  assertOptionalBoolean(options.interlace, "interlace");
  assertOptionalBoolean(options.optimizeAlpha, "optimizeAlpha");

  return {
    optimizationLevel,
    strip,
    ...(options.interlace === undefined ? {} : { interlace: options.interlace }),
    ...(options.optimizeAlpha === undefined ? {} : { optimizeAlpha: options.optimizeAlpha }),
  };
}

function normalizeOptipngOptions(options: OptipngOptions): Required<OptipngOptions> {
  for (const optionName of Object.keys(options)) {
    if (!OPTIPNG_OPTION_NAMES.has(optionName)) {
      throw new ImageminError(
        "ERR_IMAGEMIN_INVALID_OPTIONS",
        `Unknown optipng option \`${optionName}\``,
        { plugin: "optipng" },
      );
    }
  }

  const optimizationLevel = options.optimizationLevel ?? 3;
  if (!Number.isInteger(optimizationLevel) || optimizationLevel < 0 || optimizationLevel > 7) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_OPTIONS",
      "`optimizationLevel` must be an integer between 0 and 7",
      { plugin: "optipng" },
    );
  }

  const bitDepthReduction = options.bitDepthReduction ?? true;
  const colorTypeReduction = options.colorTypeReduction ?? true;
  const paletteReduction = options.paletteReduction ?? true;
  const errorRecovery = options.errorRecovery ?? true;
  const interlaced = options.interlaced === undefined ? false : options.interlaced;

  assertBoolean(bitDepthReduction, "bitDepthReduction", "optipng");
  assertBoolean(colorTypeReduction, "colorTypeReduction", "optipng");
  assertBoolean(paletteReduction, "paletteReduction", "optipng");
  assertBoolean(errorRecovery, "errorRecovery", "optipng");
  if (interlaced !== null) assertBoolean(interlaced, "interlaced", "optipng");

  return {
    bitDepthReduction,
    colorTypeReduction,
    errorRecovery,
    interlaced,
    optimizationLevel,
    paletteReduction,
  };
}

function normalizeSvgmOptions(
  options: SvgmOptions,
): Required<Pick<SvgmOptions, "preset">> & Pick<SvgmOptions, "passOverrides" | "precision"> {
  for (const optionName of Object.keys(options)) {
    if (!SVGM_OPTION_NAMES.has(optionName)) {
      throw invalidSvgmOptions(`Unknown svgm option \`${optionName}\``);
    }
  }

  const preset = options.preset ?? "safe";
  if (!SVGM_PRESETS.has(preset)) {
    throw invalidSvgmOptions('`preset` must be "safe" or "default"');
  }

  const precision = options.precision;
  if (
    precision !== undefined &&
    (!Number.isInteger(precision) || precision < 0 || precision > 15)
  ) {
    throw invalidSvgmOptions("`precision` must be an integer between 0 and 15");
  }

  const passOverrides = options.passOverrides;
  if (passOverrides !== undefined) {
    if (
      passOverrides === null ||
      typeof passOverrides !== "object" ||
      Array.isArray(passOverrides)
    ) {
      throw invalidSvgmOptions("`passOverrides` must be an object");
    }

    for (const [passName, enabled] of Object.entries(passOverrides)) {
      if (!SVGM_PASS_NAMES.has(passName as SvgmPassName)) {
        throw invalidSvgmOptions(`Unknown SVGM pass \`${passName}\``);
      }
      if (typeof enabled !== "boolean") {
        throw invalidSvgmOptions(`Override for \`${passName}\` must be a boolean`);
      }
    }
  }

  return {
    preset,
    ...(precision === undefined ? {} : { precision }),
    ...(passOverrides === undefined ? {} : { passOverrides }),
  };
}

function invalidSvgmOptions(message: string): ImageminError {
  return new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", message, {
    plugin: "svgm",
  });
}

function assertOptionalBoolean(value: boolean | undefined, optionName: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", `\`${optionName}\` must be a boolean`, {
      plugin: "oxipng",
    });
  }
}

function assertBoolean(
  value: unknown,
  optionName: string,
  plugin: string,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new ImageminError("ERR_IMAGEMIN_INVALID_OPTIONS", `\`${optionName}\` must be a boolean`, {
      plugin,
    });
  }
}
