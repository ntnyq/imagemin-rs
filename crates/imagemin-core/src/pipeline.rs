use crate::{ImageAsset, ImageFormat, NativePlugin, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OptimizationStep {
    pub plugin: &'static str,
    pub input_bytes: usize,
    pub output_bytes: usize,
    pub changed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OptimizationResult {
    asset: ImageAsset,
    input_bytes: usize,
    steps: Vec<OptimizationStep>,
}

impl OptimizationResult {
    #[must_use]
    pub const fn input_bytes(&self) -> usize {
        self.input_bytes
    }

    #[must_use]
    pub const fn output_bytes(&self) -> usize {
        self.asset.len()
    }

    #[must_use]
    pub const fn format(&self) -> ImageFormat {
        self.asset.format()
    }

    #[must_use]
    pub fn steps(&self) -> &[OptimizationStep] {
        &self.steps
    }

    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.asset.into_bytes()
    }
}

pub fn optimize<P: NativePlugin>(input: Vec<u8>, plugins: &[P]) -> Result<OptimizationResult> {
    let input_bytes = input.len();
    let mut asset = ImageAsset::new(input);
    let mut steps = Vec::with_capacity(plugins.len());

    for plugin in plugins {
        let step_input_bytes = asset.len();
        let outcome = plugin.optimize(asset)?;
        let (next_asset, changed) = outcome.into_parts();
        let output_bytes = next_asset.len();

        steps.push(OptimizationStep {
            plugin: plugin.name(),
            input_bytes: step_input_bytes,
            output_bytes,
            changed,
        });
        asset = next_asset;
    }

    Ok(OptimizationResult {
        asset,
        input_bytes,
        steps,
    })
}
