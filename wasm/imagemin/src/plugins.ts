import { throwIfAborted, withAbortSignal } from "./errors";
import { runWasmPlugins } from "./native";
import type { WasmPluginDescriptor } from "./native";
import type {
  GiflosslessOptions,
  ImageminPlugin,
  OptipngOptions,
  OxipngOptions,
  SvgmOptions,
} from "./types";

const wasmDescriptors = new WeakMap<ImageminPlugin, WasmPluginDescriptor>();

export function giflossless(options: GiflosslessOptions = {}): ImageminPlugin {
  return createWasmPlugin("giflossless", options);
}

export function oxipng(options: OxipngOptions = {}): ImageminPlugin {
  return createWasmPlugin("oxipng", options);
}

export function optipng(options: OptipngOptions = {}): ImageminPlugin {
  return createWasmPlugin("optipng", options);
}

export function svgm(options: SvgmOptions = {}): ImageminPlugin {
  return createWasmPlugin("svgm", options);
}

export function getWasmDescriptor(plugin: ImageminPlugin): WasmPluginDescriptor | undefined {
  return wasmDescriptors.get(plugin);
}

function createWasmPlugin(name: string, options: object): ImageminPlugin {
  const descriptor: WasmPluginDescriptor = {
    name,
    optionsJson: JSON.stringify(options),
  };
  const plugin: ImageminPlugin = async (input, context) => {
    throwIfAborted(context?.signal, { plugin: name });
    const result = await withAbortSignal(
      runWasmPlugins(new Uint8Array(input), [descriptor]),
      context?.signal,
      { plugin: name },
    );

    return result.data;
  };

  Object.defineProperty(plugin, "name", { value: name });
  wasmDescriptors.set(plugin, descriptor);

  return plugin;
}
