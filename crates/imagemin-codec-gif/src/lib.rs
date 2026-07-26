mod giflossless;

pub use giflossless::GiflosslessOptions;

use imagemin_core::{ImageAsset, ImageminError, NativePlugin, PluginOutcome, Result};

impl GiflosslessOptions {
    pub fn from_json(options_json: &str) -> Result<Self> {
        serde_json::from_str::<Self>(options_json).map_err(|error| ImageminError::InvalidOptions {
            plugin: "giflossless",
            message: error.to_string(),
        })
    }
}

impl NativePlugin for GiflosslessOptions {
    fn name(&self) -> &'static str {
        "giflossless"
    }

    fn optimize(&self, asset: ImageAsset) -> Result<PluginOutcome> {
        giflossless::optimize(asset, self)
    }
}
