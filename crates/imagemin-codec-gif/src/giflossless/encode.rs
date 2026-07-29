use gif::{AnyExtension, DisposalMethod, Encoder, Frame};
use imagemin_core::Result;
use rgb::RGBA8;

use super::{
    GiflosslessOptions,
    analysis::Plan,
    metadata::collect_metadata_extensions,
    support::{codec_error, decoder, validate_frame},
};

pub(super) fn encode(data: &[u8], plan: &Plan, options: &GiflosslessOptions) -> Result<Vec<u8>> {
    let mut decoder = decoder(data)?;
    let mut screen = gif_dispose::Screen::new_decoder(&decoder);
    let repeat = decoder.repeat();
    let palette: Vec<u8> = plan
        .palette
        .iter()
        .flat_map(|color| [color.r, color.g, color.b])
        .collect();
    let mut output = Vec::with_capacity(data.len());
    let mut encoder = Encoder::new(&mut output, plan.width, plan.height, &palette)
        .map_err(|error| codec_error(error.to_string()))?;
    encoder
        .set_repeat(repeat)
        .map_err(|error| codec_error(error.to_string()))?;

    if !options.strip {
        for (label, blocks) in collect_metadata_extensions(data)? {
            let block_refs: Vec<&[u8]> = blocks.iter().map(Vec::as_slice).collect();
            encoder
                .write_raw_extension(AnyExtension(label), &block_refs)
                .map_err(|error| codec_error(error.to_string()))?;
        }
    }

    let width = usize::from(plan.width);
    let mut previous: Option<Vec<RGBA8>> = None;
    while let Some(source) = decoder
        .read_next_frame()
        .map_err(|error| codec_error(error.to_string()))?
    {
        validate_frame(source)?;
        screen
            .blit_frame(source)
            .map_err(|error| codec_error(error.to_string()))?;
        let canvas: Vec<RGBA8> = screen.pixels_rgba().pixels().collect();
        let frame = build_delta_frame(source, &canvas, previous.as_deref(), plan, width)?;

        encoder
            .write_frame(&frame)
            .map_err(|error| codec_error(error.to_string()))?;
        previous = Some(canvas);
    }

    drop(encoder);
    Ok(output)
}

fn build_delta_frame(
    source: &Frame<'_>,
    canvas: &[RGBA8],
    previous: Option<&[RGBA8]>,
    plan: &Plan,
    canvas_width: usize,
) -> Result<Frame<'static>> {
    let index_of = |pixel: RGBA8| -> Result<u8> {
        if pixel.a == 0 {
            plan.transparent.ok_or_else(|| {
                codec_error("transparent pixel without a reserved palette entry".to_owned())
            })
        } else {
            plan.color_index
                .get(&pixel.rgb())
                .copied()
                .ok_or_else(|| codec_error("pixel color missing from the palette".to_owned()))
        }
    };
    let mut frame = Frame {
        delay: source.delay,
        dispose: DisposalMethod::Keep,
        needs_user_input: source.needs_user_input,
        transparent: plan.transparent,
        ..Frame::default()
    };

    let Some(previous) = previous else {
        frame.width = plan.width;
        frame.height = plan.height;
        frame.buffer = canvas
            .iter()
            .copied()
            .map(index_of)
            .collect::<Result<Vec<u8>>>()?
            .into();
        return Ok(frame);
    };

    let transparent = plan
        .transparent
        .ok_or_else(|| codec_error("delta frame without a transparent palette entry".to_owned()))?;
    let Some((left, top, right, bottom)) = diff_bbox(previous, canvas, canvas_width) else {
        frame.width = 1;
        frame.height = 1;
        frame.buffer = vec![transparent].into();
        return Ok(frame);
    };

    frame.left = u16::try_from(left).expect("GIF frame left fits the logical canvas");
    frame.top = u16::try_from(top).expect("GIF frame top fits the logical canvas");
    frame.width = u16::try_from(right - left + 1).expect("GIF frame width fits the logical canvas");
    frame.height =
        u16::try_from(bottom - top + 1).expect("GIF frame height fits the logical canvas");
    let mut buffer = Vec::with_capacity(usize::from(frame.width) * usize::from(frame.height));
    for y in top..=bottom {
        for x in left..=right {
            let index = y * canvas_width + x;
            buffer.push(if canvas[index] == previous[index] {
                transparent
            } else {
                index_of(canvas[index])?
            });
        }
    }
    frame.buffer = buffer.into();

    Ok(frame)
}

fn diff_bbox(a: &[RGBA8], b: &[RGBA8], width: usize) -> Option<(usize, usize, usize, usize)> {
    let (mut left, mut top, mut right, mut bottom) = (usize::MAX, usize::MAX, 0, 0);
    for (index, (a, b)) in a.iter().zip(b).enumerate() {
        if a != b {
            let (x, y) = (index % width, index / width);
            left = left.min(x);
            top = top.min(y);
            right = right.max(x);
            bottom = bottom.max(y);
        }
    }

    (left != usize::MAX).then_some((left, top, right, bottom))
}
