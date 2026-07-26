#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InvalidInput,
    InvalidOptions,
    UnsupportedPlugin,
    Codec,
}

impl ErrorCode {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::InvalidInput => "ERR_IMAGEMIN_INVALID_INPUT",
            Self::InvalidOptions => "ERR_IMAGEMIN_INVALID_OPTIONS",
            Self::UnsupportedPlugin => "ERR_IMAGEMIN_UNSUPPORTED_PLUGIN",
            Self::Codec => "ERR_IMAGEMIN_CODEC",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ImageminError {
    #[error("invalid input for native plugin `{plugin}`: {message}")]
    InvalidInput {
        plugin: &'static str,
        message: String,
    },

    #[error("invalid options for native plugin `{plugin}`: {message}")]
    InvalidOptions {
        plugin: &'static str,
        message: String,
    },

    #[error("unsupported native plugin `{name}`")]
    UnsupportedPlugin { name: String },

    #[error("native plugin `{plugin}` failed: {message}")]
    Codec {
        plugin: &'static str,
        message: String,
    },
}

impl ImageminError {
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::InvalidInput { .. } => ErrorCode::InvalidInput,
            Self::InvalidOptions { .. } => ErrorCode::InvalidOptions,
            Self::UnsupportedPlugin { .. } => ErrorCode::UnsupportedPlugin,
            Self::Codec { .. } => ErrorCode::Codec,
        }
    }
}

pub type Result<T> = std::result::Result<T, ImageminError>;
