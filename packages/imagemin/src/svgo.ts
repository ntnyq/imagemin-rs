import { Buffer } from "node:buffer";

import isSvg from "is-svg";
import { optimize as optimizeWithSvgo } from "svgo";

import type { ImageminPlugin, SvgoOptions } from "./types";

/**
 * Create an imagemin-compatible plugin backed by the pinned SVGO 4 runtime.
 *
 * SVGO supports executable JavaScript plugins and ordered/repeated passes, so
 * its complete configuration cannot be serialized into the native pipeline.
 * Use `svgm()` when an explicitly native, constrained profile is preferred.
 */
export function svgo(options: SvgoOptions = {}): ImageminPlugin {
  const plugin: ImageminPlugin = async (input) => {
    const source = Buffer.from(input).toString();
    if (!isSvg(source)) return input;

    const result = optimizeWithSvgo(source, {
      multipass: true,
      ...options,
    });

    return Buffer.from(result.data);
  };

  Object.defineProperty(plugin, "name", { value: "svgo" });

  return plugin;
}
