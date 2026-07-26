mod descriptor;

pub use descriptor::NativePluginDescriptor;
pub use imagemin_codec_gif::GiflosslessOptions;
pub use imagemin_codec_png::{OptipngOptions, OxipngOptions, StripMode};
pub use imagemin_codec_svg::{SvgmOptions, SvgmPreset};
pub use imagemin_core::{
    ErrorCode, ImageAsset, ImageFormat, ImageminError, NativePlugin, OptimizationResult,
    OptimizationStep, PluginOutcome, Result, optimize,
};
