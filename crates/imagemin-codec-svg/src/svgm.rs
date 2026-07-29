use std::collections::HashMap;

use imagemin_core::{ImageAsset, ImageFormat, ImageminError, PluginOutcome, Result};
use serde::Deserialize;
use svgm_core::{Config, Preset};
use xmlparser::{ElementEnd, Reference, Stream, Token, Tokenizer};

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
    let mut state = XmlValidationState::default();

    for token in Tokenizer::from(source) {
        let token = token.map_err(|error| invalid_input(error.to_string()))?;

        match token {
            Token::DtdStart { .. }
            | Token::DtdEnd { .. }
            | Token::EmptyDtd { .. }
            | Token::EntityDeclaration { .. } => {
                return Err(invalid_input(
                    "DTD and entity declarations are not accepted by the native SVG optimizer",
                ));
            }
            Token::ElementStart { prefix, local, .. } => {
                state.start_element(prefix.as_str(), local.as_str())?;
            }
            Token::Cdata { .. } => {
                state.require_inside_root("CDATA")?;
                state.count_node()?;
            }
            Token::Comment { .. } | Token::ProcessingInstruction { .. } => {
                state.count_node()?;
            }
            Token::Text { text } => {
                validate_references(text.as_str())?;
                state.accept_text(text.as_str())?;
            }
            Token::ElementEnd { end, .. } => match end {
                ElementEnd::Open => state.open_element()?,
                ElementEnd::Close(prefix, local) => {
                    state.close_element(prefix.as_str(), local.as_str())?;
                }
                ElementEnd::Empty => state.empty_element()?,
            },
            Token::Attribute { value, .. } => validate_references(value.as_str())?,
            Token::Declaration { .. } => {}
        }
    }

    state.finish()?;

    Ok(source)
}

#[derive(Default)]
struct XmlValidationState<'a> {
    open_elements: Vec<(&'a str, &'a str)>,
    pending_element: Option<(&'a str, &'a str)>,
    root_seen: bool,
    node_count: usize,
}

impl<'a> XmlValidationState<'a> {
    fn start_element(&mut self, prefix: &'a str, local: &'a str) -> Result<()> {
        if self.pending_element.is_some() {
            return Err(invalid_input("SVG contains an incomplete element start"));
        }
        if self.open_elements.is_empty() {
            if self.root_seen {
                return Err(invalid_input("SVG must contain exactly one root element"));
            }
            self.root_seen = true;
        }
        self.pending_element = Some((prefix, local));
        self.count_node()
    }

    fn open_element(&mut self) -> Result<()> {
        let element = self
            .pending_element
            .take()
            .ok_or_else(|| invalid_input("SVG contains an unmatched element open"))?;
        self.open_elements.push(element);
        if self.open_elements.len() > MAX_NESTING_DEPTH {
            return Err(invalid_input(format!(
                "SVG input exceeds the {MAX_NESTING_DEPTH}-level native nesting limit"
            )));
        }
        Ok(())
    }

    fn close_element(&mut self, prefix: &str, local: &str) -> Result<()> {
        if self.pending_element.is_some() {
            return Err(invalid_input("SVG contains an incomplete element start"));
        }
        let Some((open_prefix, open_local)) = self.open_elements.pop() else {
            return Err(invalid_input("SVG contains an unmatched closing element"));
        };
        if open_prefix != prefix || open_local != local {
            return Err(invalid_input("SVG contains mismatched closing elements"));
        }
        Ok(())
    }

    fn empty_element(&mut self) -> Result<()> {
        self.pending_element
            .take()
            .ok_or_else(|| invalid_input("SVG contains an unmatched empty element"))?;
        Ok(())
    }

    fn accept_text(&mut self, text: &str) -> Result<()> {
        if self.open_elements.is_empty() && !text.trim().is_empty() {
            return Err(invalid_input("SVG contains text outside its root element"));
        }
        self.count_node()
    }

    fn require_inside_root(&self, kind: &str) -> Result<()> {
        if self.open_elements.is_empty() {
            return Err(invalid_input(format!(
                "SVG contains {kind} outside its root element"
            )));
        }
        Ok(())
    }

    fn count_node(&mut self) -> Result<()> {
        self.node_count = self.node_count.saturating_add(1);
        if self.node_count > MAX_NODE_COUNT {
            return Err(invalid_input(format!(
                "SVG input exceeds the {MAX_NODE_COUNT}-node native limit"
            )));
        }
        Ok(())
    }

    fn finish(self) -> Result<()> {
        if self.pending_element.is_some() || !self.open_elements.is_empty() || !self.root_seen {
            return Err(invalid_input("SVG document is incomplete"));
        }
        Ok(())
    }
}

fn validate_references(text: &str) -> Result<()> {
    let mut remaining = text;
    while let Some(index) = remaining.find('&') {
        let mut stream = Stream::from(&remaining[index..]);
        let reference = stream
            .consume_reference()
            .map_err(|_| invalid_input("SVG contains an invalid XML reference"))?;
        if matches!(reference, Reference::Entity(_)) {
            return Err(invalid_input(
                "SVG contains a named entity without a permitted declaration",
            ));
        }
        remaining = &remaining[index + stream.pos()..];
    }

    Ok(())
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
