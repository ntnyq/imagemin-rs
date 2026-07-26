//! Conservative, permissively licensed GIF re-encoder.
//!
//! The delta-frame planning algorithm is adapted from losslessly 0.1.1
//! (Copyright (c) 2026 Krystian Doroszewicz, MIT). Unlike the public
//! `gifsicle()` compatibility adapter, this module does not link Gifsicle.

mod analysis;
mod encode;
mod metadata;
mod support;

use imagemin_core::{ImageAsset, ImageFormat, PluginOutcome, Result};
use serde::Deserialize;

use self::{analysis::analyze, encode::encode, support::invalid_input};

const MAX_INPUT_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct GiflosslessOptions {
    strip: bool,
}

pub(crate) fn optimize(asset: ImageAsset, options: &GiflosslessOptions) -> Result<PluginOutcome> {
    if asset.format() != ImageFormat::Gif {
        return Ok(PluginOutcome::unchanged(asset));
    }
    if asset.len() > MAX_INPUT_BYTES {
        return Err(invalid_input(format!(
            "GIF input exceeds the {MAX_INPUT_BYTES} byte limit"
        )));
    }

    let Some(plan) = analyze(asset.as_bytes())? else {
        return Ok(PluginOutcome::unchanged(asset));
    };
    let output = encode(asset.as_bytes(), &plan, options)?;

    if !options.strip && output.len() >= asset.len() {
        return Ok(PluginOutcome::unchanged(asset));
    }

    let changed = output != asset.as_bytes();
    Ok(PluginOutcome::new(ImageAsset::new(output), changed))
}
