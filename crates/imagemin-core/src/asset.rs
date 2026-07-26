use crate::ImageFormat;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageAsset {
    bytes: Vec<u8>,
    format: ImageFormat,
}

impl ImageAsset {
    #[must_use]
    pub fn new(bytes: Vec<u8>) -> Self {
        let format = ImageFormat::detect(&bytes);

        Self { bytes, format }
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    #[must_use]
    pub const fn format(&self) -> ImageFormat {
        self.format
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.bytes.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }

    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}
