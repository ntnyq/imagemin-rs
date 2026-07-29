use std::io::Cursor;

use gif::{AnyExtension, DecodeOptions, DisposalMethod, Encoder, Frame, Repeat};
use imagemin_codec_gif::GiflosslessOptions;
use imagemin_core::optimize;
use rgb::RGBA8;

#[derive(Debug, PartialEq, Eq)]
struct Animation {
    width: u16,
    height: u16,
    repeat: Repeat,
    frames: Vec<RenderedFrame>,
}

#[derive(Debug, PartialEq, Eq)]
struct RenderedFrame {
    delay: u16,
    pixels: Vec<RGBA8>,
}

#[test]
fn delta_reencode_preserves_composited_frames_delays_and_loop() {
    let input = animation_fixture();
    let output = optimize_gif(&input, "{}").expect("valid GIF").into_bytes();

    assert!(output.len() < input.len());
    assert_eq!(decode_animation(&output), decode_animation(&input));
}

#[test]
fn preserves_partial_frames_transparency_and_disposal_rendering() {
    let input = partial_transparent_fixture();
    let output = optimize_gif(&input, "{}").expect("valid GIF").into_bytes();

    assert_eq!(decode_animation(&output), decode_animation(&input));
}

#[test]
fn preserves_metadata_by_default_and_strips_it_explicitly() {
    let input = animation_fixture();
    assert!(contains_extension(&input, 0xFE));

    let preserved = optimize_gif(&input, "{}").expect("valid GIF").into_bytes();
    assert!(contains_extension(&preserved, 0xFE));

    let stripped = optimize_gif(&input, r#"{"strip":true}"#)
        .expect("valid GIF")
        .into_bytes();
    assert!(!contains_extension(&stripped, 0xFE));
    assert_eq!(decode_animation(&stripped), decode_animation(&input));
}

#[test]
fn rejects_malformed_and_resource_bomb_inputs() {
    let malformed = b"GIF89a".to_vec();
    let malformed_error = optimize_gif(&malformed, "{}").expect_err("truncated GIF must fail");
    assert_eq!(malformed_error.code().as_str(), "ERR_IMAGEMIN_CODEC");

    let mut bomb = animation_fixture();
    bomb[6..8].copy_from_slice(&u16::MAX.to_le_bytes());
    bomb[8..10].copy_from_slice(&u16::MAX.to_le_bytes());
    let bomb_error = optimize_gif(&bomb, "{}").expect_err("dimension bomb must fail");
    assert_eq!(bomb_error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

#[test]
fn rejects_zero_sized_logical_screens_without_panicking() {
    let input = animation_fixture();

    for dimension_range in [6..8, 8..10] {
        let mut invalid = input.clone();
        invalid[dimension_range].copy_from_slice(&0_u16.to_le_bytes());

        let error = optimize_gif(&invalid, "{}").expect_err("zero-sized canvas must fail");
        assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
    }
}

#[test]
fn rejects_zero_sized_frames_without_panicking() {
    let error =
        optimize_gif(&zero_sized_frame_fixture(), "{}").expect_err("zero-sized frame must fail");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

fn optimize_gif(
    input: &[u8],
    options: &str,
) -> imagemin_core::Result<imagemin_core::OptimizationResult> {
    let plugin = GiflosslessOptions::from_json(options)?;
    optimize(input.to_vec(), &[plugin])
}

fn animation_fixture() -> Vec<u8> {
    const WIDTH: u16 = 32;
    const HEIGHT: u16 = 24;
    let palette = [0, 0, 0, 255, 40, 40, 40, 220, 80];
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, WIDTH, HEIGHT, &palette).expect("valid encoder");
    encoder
        .set_repeat(Repeat::Finite(3))
        .expect("valid repeat extension");
    encoder
        .write_raw_extension(AnyExtension(0xFE), &[b"imagemin-rs GIF fixture"])
        .expect("valid comment extension");

    for index in 0..8_u16 {
        let mut pixels = vec![0; usize::from(WIDTH) * usize::from(HEIGHT)];
        let left = usize::from(index * 3);
        for y in 8..16 {
            for x in left..left + 6 {
                pixels[y * usize::from(WIDTH) + x] = if index % 2 == 0 { 1 } else { 2 };
            }
        }
        let mut frame = Frame::from_indexed_pixels(WIDTH, HEIGHT, pixels, None);
        frame.delay = index + 1;
        frame.dispose = DisposalMethod::Keep;
        encoder.write_frame(&frame).expect("valid animation frame");
    }

    drop(encoder);
    output
}

fn zero_sized_frame_fixture() -> Vec<u8> {
    vec![
        0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x18, 0x00, 0x91, 0x00, 0x00, 0x00, 0x00,
        0x00, 0xFF, 0x28, 0x28, 0x28, 0xDC, 0x50, 0x00, 0x21, 0xFE, 0x21, 0xFE, 0x17, 0x69, 0x6D,
        0x61, 0x67, 0x6A, 0x1F, 0xBC, 0xD7, 0x7F, 0xAC, 0x2A, 0x8E, 0xA1, 0xFB, 0xCC, 0x2A, 0xCC,
        0x2A, 0xC2, 0x65, 0x00, 0x21, 0xAC, 0x04, 0x04, 0x01, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x49, 0x09, 0x65, 0x16, 0x0F, 0xA9, 0xCB, 0xDA, 0x8B,
        0x33, 0xEA, 0x1F, 0xBC, 0xC2, 0xAC,
    ]
}

fn partial_transparent_fixture() -> Vec<u8> {
    const WIDTH: u16 = 12;
    const HEIGHT: u16 = 10;
    let palette = [0, 0, 0, 255, 0, 0, 0, 255, 0];
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, WIDTH, HEIGHT, &palette).expect("valid encoder");
    encoder
        .set_repeat(Repeat::Infinite)
        .expect("valid repeat extension");

    let mut first = Frame::from_indexed_pixels(
        WIDTH,
        HEIGHT,
        (0..usize::from(WIDTH) * usize::from(HEIGHT))
            .map(|index| u8::from(index % 5 == 0))
            .collect::<Vec<_>>(),
        Some(0),
    );
    first.delay = 4;
    first.dispose = DisposalMethod::Keep;
    encoder.write_frame(&first).expect("valid first frame");

    let mut partial = Frame::from_indexed_pixels(4, 3, vec![2; 12], None);
    partial.left = 3;
    partial.top = 2;
    partial.delay = 7;
    partial.dispose = DisposalMethod::Background;
    encoder.write_frame(&partial).expect("valid partial frame");

    let mut final_frame = Frame::from_indexed_pixels(2, 2, vec![1; 4], None);
    final_frame.left = 8;
    final_frame.top = 6;
    final_frame.delay = 9;
    final_frame.dispose = DisposalMethod::Previous;
    encoder
        .write_frame(&final_frame)
        .expect("valid final frame");

    drop(encoder);
    output
}

fn decode_animation(input: &[u8]) -> Animation {
    let mut options = DecodeOptions::new();
    options.set_color_output(gif::ColorOutput::Indexed);
    let mut decoder = options
        .read_info(Cursor::new(input))
        .expect("decodable GIF");
    let width = decoder.width();
    let height = decoder.height();
    let repeat = decoder.repeat();
    let mut screen = gif_dispose::Screen::new_decoder(&decoder);
    let mut frames = Vec::new();

    loop {
        let frame = decoder
            .read_next_frame()
            .unwrap_or_else(|error| panic!("decodable GIF frame {}: {error}", frames.len()));
        let Some(frame) = frame else {
            break;
        };
        screen.blit_frame(frame).expect("renderable GIF frame");
        frames.push(RenderedFrame {
            delay: frame.delay,
            pixels: screen.pixels_rgba().pixels().collect(),
        });
    }

    Animation {
        width,
        height,
        repeat,
        frames,
    }
}

fn contains_extension(input: &[u8], label: u8) -> bool {
    input.windows(2).any(|window| window == [0x21, label])
}
