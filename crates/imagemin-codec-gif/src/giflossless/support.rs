use std::{io::Cursor, num::NonZeroU64};

use gif::DecodeOptions;
use imagemin_core::{ImageminError, Result};

const MAX_CANVAS_BYTES: u64 = 128 * 1024 * 1024;

pub(super) fn decoder(data: &[u8]) -> Result<gif::Decoder<Cursor<&[u8]>>> {
    let mut options = DecodeOptions::new();
    options.set_color_output(gif::ColorOutput::Indexed);
    options.set_memory_limit(gif::MemoryLimit::Bytes(
        NonZeroU64::new(MAX_CANVAS_BYTES).expect("non-zero GIF memory limit"),
    ));
    options.check_frame_consistency(true);
    options.check_lzw_end_code(true);
    options
        .read_info(Cursor::new(data))
        .map_err(|error| codec_error(error.to_string()))
}

pub(super) fn validate_canvas(width: u16, height: u16) -> Result<()> {
    if width == 0 || height == 0 {
        return Err(invalid_input(
            "GIF logical screen dimensions must be non-zero".to_owned(),
        ));
    }

    let bytes = u64::from(width)
        .checked_mul(u64::from(height))
        .and_then(|pixels| pixels.checked_mul(8))
        .ok_or_else(|| invalid_input("GIF canvas size overflows".to_owned()))?;
    if bytes > MAX_CANVAS_BYTES {
        return Err(invalid_input(format!(
            "GIF decoded canvas exceeds the {MAX_CANVAS_BYTES} byte limit"
        )));
    }

    Ok(())
}

pub(super) fn validate_frame(frame: &gif::Frame<'_>) -> Result<()> {
    if frame.width == 0 || frame.height == 0 {
        return Err(invalid_input(
            "GIF frame dimensions must be non-zero".to_owned(),
        ));
    }

    Ok(())
}

pub(super) fn invalid_input(message: String) -> ImageminError {
    ImageminError::InvalidInput {
        plugin: "giflossless",
        message,
    }
}

pub(super) fn codec_error(message: String) -> ImageminError {
    ImageminError::Codec {
        plugin: "giflossless",
        message,
    }
}
