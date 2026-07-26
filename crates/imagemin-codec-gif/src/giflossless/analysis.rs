use std::collections::HashMap;

use imagemin_core::Result;
use rgb::{RGB8, RGBA8};

use super::support::{codec_error, decoder, invalid_input, validate_canvas};

const MAX_COMPOSITED_PIXELS: u64 = 256 * 1024 * 1024;
const MAX_FRAMES: usize = 10_000;

pub(super) struct Plan {
    pub width: u16,
    pub height: u16,
    pub palette: Vec<RGB8>,
    pub color_index: HashMap<RGB8, u8>,
    pub transparent: Option<u8>,
}

pub(super) fn analyze(data: &[u8]) -> Result<Option<Plan>> {
    let mut decoder = decoder(data)?;
    validate_canvas(decoder.width(), decoder.height())?;
    let mut screen = gif_dispose::Screen::new_decoder(&decoder);
    let canvas_pixels = u64::from(decoder.width()) * u64::from(decoder.height());

    let mut palette = Vec::with_capacity(256);
    let mut color_index = HashMap::with_capacity(256);
    let mut has_transparency = false;
    let mut previous: Option<Vec<RGBA8>> = None;
    let mut frames = 0_usize;
    let mut composited_pixels = 0_u64;

    while let Some(frame) = decoder
        .read_next_frame()
        .map_err(|error| codec_error(format!("invalid GIF data: {error}")))?
    {
        frames += 1;
        if frames > MAX_FRAMES {
            return Err(invalid_input(format!(
                "GIF exceeds the {MAX_FRAMES} frame limit"
            )));
        }
        composited_pixels = composited_pixels
            .checked_add(canvas_pixels)
            .ok_or_else(|| invalid_input("GIF composited pixel count overflows".to_owned()))?;
        if composited_pixels > MAX_COMPOSITED_PIXELS {
            return Err(invalid_input(format!(
                "GIF exceeds the {MAX_COMPOSITED_PIXELS} composited pixel limit"
            )));
        }

        screen
            .blit_frame(frame)
            .map_err(|error| codec_error(format!("invalid GIF frame: {error}")))?;
        let canvas: Vec<RGBA8> = screen.pixels_rgba().pixels().collect();

        for (index, pixel) in canvas.iter().enumerate() {
            if pixel.a == 0 {
                has_transparency = true;
                if previous
                    .as_ref()
                    .is_some_and(|previous| previous[index].a != 0)
                {
                    return Ok(None);
                }
            } else {
                let color = pixel.rgb();
                if let std::collections::hash_map::Entry::Vacant(entry) = color_index.entry(color) {
                    if palette.len() == 256 {
                        return Ok(None);
                    }
                    entry.insert(
                        u8::try_from(palette.len()).expect("GIF palette has fewer than 256 colors"),
                    );
                    palette.push(color);
                }
            }
        }

        previous = Some(canvas);
    }

    if frames == 0 {
        return Err(codec_error("GIF contains no frames".to_owned()));
    }

    let transparent = if has_transparency || frames > 1 {
        if palette.len() == 256 {
            return Ok(None);
        }
        let index = u8::try_from(palette.len()).expect("GIF palette has fewer than 256 colors");
        palette.push(RGB8::new(0, 0, 0));
        Some(index)
    } else {
        None
    };

    Ok(Some(Plan {
        width: decoder.width(),
        height: decoder.height(),
        palette,
        color_index,
        transparent,
    }))
}
