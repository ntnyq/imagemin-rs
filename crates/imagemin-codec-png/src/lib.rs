mod optipng;
mod oxipng;

pub use optipng::OptipngOptions;
pub use oxipng::{OxipngOptions, StripMode};

use imagemin_core::{ImageminError, NativePlugin, PluginOutcome, Result};

impl OxipngOptions {
    pub fn from_json(options_json: &str) -> Result<Self> {
        let options = serde_json::from_str::<Self>(options_json).map_err(|error| {
            ImageminError::InvalidOptions {
                plugin: "oxipng",
                message: error.to_string(),
            }
        })?;
        options.validate()?;

        Ok(options)
    }
}

impl NativePlugin for OxipngOptions {
    fn name(&self) -> &'static str {
        "oxipng"
    }

    fn optimize(&self, asset: imagemin_core::ImageAsset) -> Result<PluginOutcome> {
        oxipng::optimize(asset, self)
    }
}

impl OptipngOptions {
    pub fn from_json(options_json: &str) -> Result<Self> {
        let options = serde_json::from_str::<Self>(options_json).map_err(|error| {
            ImageminError::InvalidOptions {
                plugin: "optipng",
                message: error.to_string(),
            }
        })?;
        options.validate()?;

        Ok(options)
    }
}

impl NativePlugin for OptipngOptions {
    fn name(&self) -> &'static str {
        "optipng"
    }

    fn optimize(&self, asset: imagemin_core::ImageAsset) -> Result<PluginOutcome> {
        optipng::optimize(asset, self)
    }
}
