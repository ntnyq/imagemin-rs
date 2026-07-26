use serde::Deserialize;

use super::oxipng::optimize_with_options;
use imagemin_core::{ImageAsset, ImageFormat, ImageminError, PluginOutcome, Result};

#[allow(clippy::struct_excessive_bools)] // Mirrors imagemin-optipng's public switches.
#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct OptipngOptions {
    optimization_level: u8,
    bit_depth_reduction: bool,
    color_type_reduction: bool,
    palette_reduction: bool,
    interlaced: Option<bool>,
    error_recovery: bool,
}

impl Default for OptipngOptions {
    fn default() -> Self {
        Self {
            optimization_level: 3,
            bit_depth_reduction: true,
            color_type_reduction: true,
            palette_reduction: true,
            interlaced: Some(false),
            error_recovery: true,
        }
    }
}

impl OptipngOptions {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.optimization_level > 7 {
            return Err(ImageminError::InvalidOptions {
                plugin: "optipng",
                message: "`optimizationLevel` must be between 0 and 7".to_owned(),
            });
        }

        Ok(())
    }
}

pub(crate) fn optimize(asset: ImageAsset, config: &OptipngOptions) -> Result<PluginOutcome> {
    if asset.format() != ImageFormat::Png {
        return Ok(PluginOutcome::unchanged(asset));
    }
    // OptiPNG 0.7.7 predates APNG, while StripChunks::All would remove the
    // animation-control chunks and silently turn the asset into a static PNG.
    // Preserve the complete animation until an APNG-aware profile has its own
    // frame-composition conformance oracle.
    if is_apng(asset.as_bytes()) {
        return Ok(PluginOutcome::unchanged(asset));
    }

    // Oxipng has presets 0..=6. Preset 6 is the closest exhaustive profile
    // for OptiPNG levels 6 and 7; this mapping is part of the public
    // compatibility table and is not a byte-for-byte OptiPNG claim.
    let mut options = oxipng::Options::from_preset(config.optimization_level.min(6));
    if config.optimization_level == 0 {
        // OptiPNG 0.7.7 defines -o0 as -o1 -nx -nz, regardless of the
        // individual reduction switches supplied by imagemin.
        options.bit_depth_reduction = false;
        options.color_type_reduction = false;
        options.grayscale_reduction = false;
        options.palette_reduction = false;
        options.idat_recoding = false;
    } else {
        options.bit_depth_reduction = config.bit_depth_reduction;
        options.color_type_reduction = config.color_type_reduction;
        // OptiPNG's `-nc` disables every color-type conversion, including the
        // separate grayscale reduction switch exposed by Oxipng.
        options.grayscale_reduction = config.color_type_reduction;
        options.palette_reduction = config.palette_reduction;
    }
    options.interlace = config.interlaced;
    options.fix_errors = config.error_recovery;
    // imagemin-optipng requests transformations (-strip all and -i 0 by
    // default) even when they increase the file size. It also prioritizes a
    // repaired file over returning the smaller broken input.
    options.force = true;
    // imagemin-optipng@8 always passes `-strip all`.
    options.strip = oxipng::StripChunks::All;

    optimize_with_options(asset, options, "optipng")
}

fn is_apng(input: &[u8]) -> bool {
    let mut offset = 8_usize;
    while offset + 12 <= input.len() {
        let Ok(length_bytes) = input[offset..offset + 4].try_into() else {
            return false;
        };
        let length = u32::from_be_bytes(length_bytes) as usize;
        let Some(next_offset) = offset.checked_add(12 + length) else {
            return false;
        };
        if next_offset > input.len() {
            return false;
        }
        if &input[offset + 4..offset + 8] == b"acTL" {
            return true;
        }
        offset = next_offset;
    }

    false
}
