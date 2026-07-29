#![allow(clippy::needless_pass_by_value)]

use imagemin::{ImageminError, NativePluginDescriptor, OptimizationResult, optimize};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WasmPluginDescriptor {
    name: String,
    options_json: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmOptimizationStep {
    plugin: String,
    input_bytes: usize,
    output_bytes: usize,
    changed: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct WasmOptimizationResult {
    #[serde(with = "serde_bytes")]
    data: Vec<u8>,
    format: String,
    input_bytes: usize,
    output_bytes: usize,
    steps: Vec<WasmOptimizationStep>,
}

#[wasm_bindgen]
#[must_use]
pub fn runtime_name() -> String {
    "imagemin-rs".to_owned()
}

#[wasm_bindgen]
pub fn optimize_native(input: Vec<u8>, plugins: JsValue) -> Result<JsValue, JsValue> {
    let plugins = serde_wasm_bindgen::from_value::<Vec<WasmPluginDescriptor>>(plugins)
        .map_err(|error| JsValue::from_str(&format!("ERR_IMAGEMIN_INVALID_OPTIONS: {error}")))?;
    let result = execute(input, plugins).map_err(to_js_error)?;

    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!(
            "ERR_IMAGEMIN_CODEC: failed to serialize WASM result: {error}"
        ))
    })
}

fn execute(
    input: Vec<u8>,
    plugins: Vec<WasmPluginDescriptor>,
) -> imagemin::Result<WasmOptimizationResult> {
    let plugins = plugins
        .into_iter()
        .map(|plugin| NativePluginDescriptor::from_json(&plugin.name, &plugin.options_json))
        .collect::<imagemin::Result<Vec<_>>>()?;
    let result = optimize(input, &plugins)?;

    Ok(to_wasm_result(result))
}

fn to_wasm_result(result: OptimizationResult) -> WasmOptimizationResult {
    let format = result.format().to_string();
    let input_bytes = result.input_bytes();
    let output_bytes = result.output_bytes();
    let steps = result
        .steps()
        .iter()
        .map(|step| WasmOptimizationStep {
            plugin: step.plugin.to_owned(),
            input_bytes: step.input_bytes,
            output_bytes: step.output_bytes,
            changed: step.changed,
        })
        .collect();

    WasmOptimizationResult {
        data: result.into_bytes(),
        format,
        input_bytes,
        output_bytes,
        steps,
    }
}

fn to_js_error(error: ImageminError) -> JsValue {
    JsValue::from_str(&format!("{}: {error}", error.code().as_str()))
}

#[cfg(test)]
mod tests {
    use super::{WasmPluginDescriptor, execute};

    const SVG: &[u8] =
        br##"<svg viewBox="0 0 24 24"><!-- remove --><path fill="#ff0000" d="M0 0h24v24z"/></svg>"##;

    #[test]
    fn dispatches_shared_native_plugins_and_preserves_statistics() {
        let result = execute(
            SVG.to_vec(),
            vec![WasmPluginDescriptor {
                name: "svgm".to_owned(),
                options_json: "{}".to_owned(),
            }],
        )
        .expect("valid SVG");

        assert_eq!(result.format, "svg");
        assert_eq!(result.input_bytes, SVG.len());
        assert_eq!(result.output_bytes, result.data.len());
        assert_eq!(result.steps.len(), 1);
        assert_eq!(result.steps[0].plugin, "svgm");
        assert!(result.output_bytes <= result.input_bytes);
    }

    #[test]
    fn rejects_plugins_outside_the_wasm_registry() {
        let error = execute(
            SVG.to_vec(),
            vec![WasmPluginDescriptor {
                name: "mozjpeg".to_owned(),
                options_json: "{}".to_owned(),
            }],
        )
        .expect_err("sidecars are not part of the WASM registry");

        assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_UNSUPPORTED_PLUGIN");
    }
}
