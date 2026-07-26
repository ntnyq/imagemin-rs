use imagemin_codec_gif::GiflosslessOptions;
use imagemin_codec_png::{OptipngOptions, OxipngOptions};
use imagemin_codec_svg::SvgmOptions;
use imagemin_core::{ImageAsset, ImageminError, NativePlugin, PluginOutcome, Result};

/// Closed registry used at the napi-rs boundary to deserialize native plugins.
#[derive(Debug, Clone)]
pub enum NativePluginDescriptor {
    Giflossless(GiflosslessOptions),
    Oxipng(OxipngOptions),
    Optipng(OptipngOptions),
    Svgm(SvgmOptions),
}

impl NativePluginDescriptor {
    pub fn from_json(name: &str, options_json: &str) -> Result<Self> {
        match name {
            "giflossless" => GiflosslessOptions::from_json(options_json).map(Self::Giflossless),
            "oxipng" => OxipngOptions::from_json(options_json).map(Self::Oxipng),
            "optipng" => OptipngOptions::from_json(options_json).map(Self::Optipng),
            "svgm" => SvgmOptions::from_json(options_json).map(Self::Svgm),
            _ => Err(ImageminError::UnsupportedPlugin {
                name: name.to_owned(),
            }),
        }
    }

    #[must_use]
    pub const fn name(&self) -> &'static str {
        match self {
            Self::Giflossless(_) => "giflossless",
            Self::Oxipng(_) => "oxipng",
            Self::Optipng(_) => "optipng",
            Self::Svgm(_) => "svgm",
        }
    }
}

impl NativePlugin for NativePluginDescriptor {
    fn name(&self) -> &'static str {
        Self::name(self)
    }

    fn optimize(&self, asset: ImageAsset) -> Result<PluginOutcome> {
        match self {
            Self::Giflossless(options) => options.optimize(asset),
            Self::Oxipng(options) => options.optimize(asset),
            Self::Optipng(options) => options.optimize(asset),
            Self::Svgm(options) => options.optimize(asset),
        }
    }
}
