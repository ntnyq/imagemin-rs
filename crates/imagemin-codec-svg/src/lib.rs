mod svgm;

pub use svgm::{SvgmOptions, SvgmPreset};

use imagemin_core::{ImageAsset, ImageminError, NativePlugin, PluginOutcome, Result};

impl SvgmOptions {
    pub fn from_json(options_json: &str) -> Result<Self> {
        let options = serde_json::from_str::<Self>(options_json).map_err(|error| {
            ImageminError::InvalidOptions {
                plugin: "svgm",
                message: error.to_string(),
            }
        })?;
        options.validate()?;

        Ok(options)
    }
}

impl NativePlugin for SvgmOptions {
    fn name(&self) -> &'static str {
        "svgm"
    }

    fn optimize(&self, asset: ImageAsset) -> Result<PluginOutcome> {
        svgm::optimize(asset, self)
    }
}
