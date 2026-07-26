#![allow(clippy::needless_pass_by_value)]

use imagemin::{NativePluginDescriptor, OptimizationResult, optimize};
use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct JsNativePluginDescriptor {
    pub name: String,
    pub options_json: String,
}

#[napi(object)]
pub struct JsOptimizationStep {
    pub plugin: String,
    pub input_bytes: u32,
    pub output_bytes: u32,
    pub changed: bool,
}

#[napi(object)]
pub struct JsOptimizationResult {
    pub data: Buffer,
    pub format: String,
    pub input_bytes: u32,
    pub output_bytes: u32,
    pub steps: Vec<JsOptimizationStep>,
}

pub struct OptimizeTask {
    input: Buffer,
    plugins: Vec<NativePluginDescriptor>,
}

#[napi]
impl Task for OptimizeTask {
    type Output = OptimizationResult;
    type JsValue = JsOptimizationResult;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        optimize(self.input.as_ref().to_vec(), &self.plugins).map_err(to_napi_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        let format = output.format().to_string();
        let input_bytes = usize_to_js_bytes(output.input_bytes())?;
        let output_bytes = usize_to_js_bytes(output.output_bytes())?;
        let steps = output
            .steps()
            .iter()
            .map(|step| {
                Ok(JsOptimizationStep {
                    plugin: step.plugin.to_owned(),
                    input_bytes: usize_to_js_bytes(step.input_bytes)?,
                    output_bytes: usize_to_js_bytes(step.output_bytes)?,
                    changed: step.changed,
                })
            })
            .collect::<napi::Result<Vec<_>>>()?;

        Ok(JsOptimizationResult {
            data: output.into_bytes().into(),
            format,
            input_bytes,
            output_bytes,
            steps,
        })
    }
}

#[napi(js_name = "optimizeNative")]
pub fn optimize_native(
    input: Buffer,
    plugins: Vec<JsNativePluginDescriptor>,
) -> napi::Result<AsyncTask<OptimizeTask>> {
    let plugins = plugins
        .into_iter()
        .map(|plugin| NativePluginDescriptor::from_json(&plugin.name, &plugin.options_json))
        .collect::<imagemin::Result<Vec<_>>>()
        .map_err(to_napi_error)?;

    Ok(AsyncTask::new(OptimizeTask { input, plugins }))
}

fn usize_to_js_bytes(value: usize) -> napi::Result<u32> {
    u32::try_from(value).map_err(|_| {
        napi::Error::new(
            Status::InvalidArg,
            "ERR_IMAGEMIN_INVALID_INPUT: Image exceeds the JavaScript Uint8Array size limit",
        )
    })
}

fn to_napi_error(error: imagemin::ImageminError) -> napi::Error {
    napi::Error::new(
        Status::GenericFailure,
        format!("{}: {error}", error.code().as_str()),
    )
}
