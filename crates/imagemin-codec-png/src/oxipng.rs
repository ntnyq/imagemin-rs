use serde::Deserialize;

use imagemin_core::{ImageAsset, ImageFormat, ImageminError, PluginOutcome, Result};

const MAX_PNG_INPUT_BYTES: usize = 256 * 1024 * 1024;
const MAX_PNG_DECODED_BYTES: usize = 512 * 1024 * 1024;

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StripMode {
    None,
    #[default]
    Safe,
    All,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct OxipngOptions {
    pub optimization_level: u8,
    pub strip: StripMode,
    pub optimize_alpha: bool,
    pub interlace: Option<bool>,
}

impl Default for OxipngOptions {
    fn default() -> Self {
        Self {
            optimization_level: 2,
            strip: StripMode::Safe,
            optimize_alpha: false,
            interlace: None,
        }
    }
}

impl OxipngOptions {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.optimization_level > 6 {
            return Err(ImageminError::InvalidOptions {
                plugin: "oxipng",
                message: "`optimizationLevel` must be between 0 and 6".to_owned(),
            });
        }

        Ok(())
    }
}

pub(crate) fn optimize(asset: ImageAsset, config: &OxipngOptions) -> Result<PluginOutcome> {
    if asset.format() != ImageFormat::Png {
        return Ok(PluginOutcome::unchanged(asset));
    }

    let mut options = oxipng::Options::from_preset(config.optimization_level);
    options.strip = match config.strip {
        StripMode::None => oxipng::StripChunks::None,
        StripMode::Safe => oxipng::StripChunks::Safe,
        StripMode::All => oxipng::StripChunks::All,
    };
    options.optimize_alpha = config.optimize_alpha;
    options.interlace = config.interlace;

    optimize_with_options(asset, options, "oxipng")
}

pub(super) fn optimize_with_options(
    asset: ImageAsset,
    mut options: oxipng::Options,
    plugin: &'static str,
) -> Result<PluginOutcome> {
    let allow_larger_output = options.force;
    validate_resource_limits(asset.as_bytes(), plugin)?;
    options.max_decompressed_size = Some(MAX_PNG_DECODED_BYTES);

    let output = oxipng::optimize_from_memory(asset.as_bytes(), &options).map_err(|error| {
        ImageminError::Codec {
            plugin,
            message: error.to_string(),
        }
    })?;
    let changed = output != asset.as_bytes();

    if allow_larger_output || output.len() <= asset.len() {
        Ok(PluginOutcome::new(ImageAsset::new(output), changed))
    } else {
        Ok(PluginOutcome::unchanged(asset))
    }
}

fn validate_resource_limits(input: &[u8], plugin: &'static str) -> Result<()> {
    if input.len() > MAX_PNG_INPUT_BYTES {
        return Err(ImageminError::InvalidInput {
            plugin,
            message: format!("PNG input exceeds the {MAX_PNG_INPUT_BYTES}-byte native limit"),
        });
    }

    if let (Some(width), Some(height)) = (input.get(16..20), input.get(20..24)) {
        let width = u32::from_be_bytes(width.try_into().expect("four-byte PNG width"));
        let height = u32::from_be_bytes(height.try_into().expect("four-byte PNG height"));
        let decoded_bytes = u64::from(width)
            .saturating_mul(u64::from(height))
            .saturating_mul(8);

        if decoded_bytes > MAX_PNG_DECODED_BYTES as u64 {
            return Err(ImageminError::InvalidInput {
                plugin,
                message: format!(
                    "PNG dimensions exceed the {MAX_PNG_DECODED_BYTES}-byte native decode limit"
                ),
            });
        }
    }

    Ok(())
}
