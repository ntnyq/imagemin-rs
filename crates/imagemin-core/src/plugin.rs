use crate::{ImageAsset, Result};

/// A configured native optimizer that can participate in the core pipeline.
pub trait NativePlugin {
    fn name(&self) -> &'static str;

    fn optimize(&self, asset: ImageAsset) -> Result<PluginOutcome>;
}

/// The next asset and accounting signal produced by one plugin invocation.
pub struct PluginOutcome {
    asset: ImageAsset,
    changed: bool,
}

impl PluginOutcome {
    #[must_use]
    pub const fn new(asset: ImageAsset, changed: bool) -> Self {
        Self { asset, changed }
    }

    #[must_use]
    pub fn unchanged(asset: ImageAsset) -> Self {
        Self::new(asset, false)
    }

    #[must_use]
    pub fn into_parts(self) -> (ImageAsset, bool) {
        (self.asset, self.changed)
    }
}
