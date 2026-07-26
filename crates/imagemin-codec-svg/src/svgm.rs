use std::collections::HashMap;

use imagemin_core::{ImageAsset, ImageFormat, ImageminError, PluginOutcome, Result};
use serde::Deserialize;
use svgm_core::{Config, Preset};
use xmlparser::{ElementEnd, Token, Tokenizer};

const MAX_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_NODE_COUNT: usize = 100_000;
const MAX_NESTING_DEPTH: usize = 256;
const MAX_PRECISION: u32 = 15;

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SvgmPreset {
    #[default]
    Safe,
    Default,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct SvgmOptions {
    preset: SvgmPreset,
    precision: Option<u32>,
    pass_overrides: HashMap<String, bool>,
}

impl SvgmOptions {
    pub(crate) fn validate(&self) -> Result<()> {
        if self
            .precision
            .is_some_and(|precision| precision > MAX_PRECISION)
        {
            return Err(invalid_options(format!(
                "`precision` must be an integer between 0 and {MAX_PRECISION}"
            )));
        }

        let known_passes = svgm_core::config::all_pass_names();
        for pass_name in self.pass_overrides.keys() {
            if !known_passes.contains(&pass_name.as_str()) {
                return Err(invalid_options(format!("unknown SVGM pass `{pass_name}`")));
            }
        }

        Ok(())
    }

    fn to_svgm_config(&self) -> Config {
        Config {
            preset: match self.preset {
                SvgmPreset::Safe => Preset::Safe,
                SvgmPreset::Default => Preset::Default,
            },
            precision: self.precision,
            pass_overrides: self.pass_overrides.clone(),
        }
    }
}

pub(crate) fn optimize(asset: ImageAsset, options: &SvgmOptions) -> Result<PluginOutcome> {
    if asset.format() != ImageFormat::Svg {
        return Ok(PluginOutcome::unchanged(asset));
    }

    let source = validate_input(asset.as_bytes())?;
    let output = svgm_core::optimize_with_config(source, &options.to_svgm_config())
        .map_err(codec_error)?
        .data;
    // SVGM serializes only the root element tree: a truncated document such as
    // `<svg` yields an empty string and a non-svg root drops the detectable
    // prefix. Surface that as a codec error instead of silently emitting a
    // buffer that is no longer an SVG.
    if ImageFormat::detect(output.as_bytes()) != ImageFormat::Svg {
        return Err(codec_error(
            "optimized output is no longer a detectable SVG document",
        ));
    }
    let changed = output.as_bytes() != asset.as_bytes();

    Ok(PluginOutcome::new(
        ImageAsset::new(output.into_bytes()),
        changed,
    ))
}

fn validate_input(input: &[u8]) -> Result<&str> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(invalid_input(format!(
            "SVG input exceeds the {MAX_INPUT_BYTES}-byte native limit"
        )));
    }

    let source =
        std::str::from_utf8(input).map_err(|_| invalid_input("SVG input must be valid UTF-8"))?;
    let mut depth = 0_usize;
    let mut node_count = 0_usize;

    for token in Tokenizer::from(source) {
        let token = token.map_err(codec_error)?;

        match token {
            Token::DtdStart { .. }
            | Token::DtdEnd { .. }
            | Token::EmptyDtd { .. }
            | Token::EntityDeclaration { .. } => {
                return Err(invalid_input(
                    "DTD and entity declarations are not accepted by the native SVG optimizer",
                ));
            }
            Token::ElementStart { .. }
            | Token::Text { .. }
            | Token::Cdata { .. }
            | Token::Comment { .. }
            | Token::ProcessingInstruction { .. } => {
                node_count = node_count.saturating_add(1);
                if node_count > MAX_NODE_COUNT {
                    return Err(invalid_input(format!(
                        "SVG input exceeds the {MAX_NODE_COUNT}-node native limit"
                    )));
                }
            }
            Token::ElementEnd { end, .. } => match end {
                ElementEnd::Open => {
                    depth = depth.saturating_add(1);
                    if depth > MAX_NESTING_DEPTH {
                        return Err(invalid_input(format!(
                            "SVG input exceeds the {MAX_NESTING_DEPTH}-level native nesting limit"
                        )));
                    }
                }
                ElementEnd::Close(_, _) => depth = depth.saturating_sub(1),
                ElementEnd::Empty => {}
            },
            Token::Declaration { .. } | Token::Attribute { .. } => {}
        }
    }

    Ok(source)
}

fn invalid_options(message: impl Into<String>) -> ImageminError {
    ImageminError::InvalidOptions {
        plugin: "svgm",
        message: message.into(),
    }
}

fn invalid_input(message: impl Into<String>) -> ImageminError {
    ImageminError::InvalidInput {
        plugin: "svgm",
        message: message.into(),
    }
}

fn codec_error(error: impl std::fmt::Display) -> ImageminError {
    ImageminError::Codec {
        plugin: "svgm",
        message: error.to_string(),
    }
}
