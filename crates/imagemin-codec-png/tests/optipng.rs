use std::io::Cursor;

use imagemin_codec_png::OptipngOptions;
use imagemin_core::optimize;
use png::{BitDepth, ColorType, Decoder, Encoder, Transformations};

#[test]
fn default_profile_is_lossless_and_uses_optipng_defaults() {
    let input = rgb_fixture();
    let result = optimize_png(&input, "{}").expect("valid PNG");
    let output = result.into_bytes();

    assert!(output.len() <= input.len());
    assert_eq!(decode_rgba(&output), decode_rgba(&input));
    assert_eq!(output[28], 0, "OptiPNG default disables interlacing");
}

#[test]
fn default_profile_strips_all_ancillary_chunks_like_imagemin_optipng() {
    let input = rgb_fixture_with_text();
    assert!(contains_chunk(&input, *b"tEXt"));

    let output = optimize_png(&input, "{}").expect("valid PNG").into_bytes();

    assert!(!contains_chunk(&output, *b"tEXt"));
    assert_eq!(decode_rgba(&output), decode_rgba(&input));
}

#[test]
fn keeps_required_transformations_even_when_a_tiny_output_grows() {
    let input = tiny_png();
    let output = optimize_png(&input, "{}").expect("valid PNG").into_bytes();

    assert!(output.len() > input.len());
    assert_eq!(decode_rgba(&output), decode_rgba(&input));
}

#[test]
fn error_recovery_repairs_crc_errors_instead_of_returning_broken_input() {
    let input = corrupt_chunk_crc(rgb_fixture(), *b"IDAT");

    let output = optimize_png(&input, "{}")
        .expect("default error recovery repairs CRC")
        .into_bytes();
    decode_rgba(&output);
    assert_ne!(output, input);

    let error = optimize_png(&input, r#"{"errorRecovery":false}"#)
        .expect_err("disabled error recovery must reject the CRC mismatch");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_CODEC");
}

#[test]
fn preserves_apng_animation_control_and_frame_timing() {
    let input = apng_fixture();
    let output = optimize_png(&input, "{}").expect("valid APNG").into_bytes();

    assert_eq!(output, input, "APNG is a documented conservative no-op");
    assert_eq!(apng_metadata(&output), apng_metadata(&input));
    assert_eq!(decode_rgba(&output), decode_rgba(&input));
}

#[test]
fn reduction_switches_and_interlacing_are_mapped_explicitly() {
    let input = rgb_fixture();
    let output = optimize_png(
        &input,
        r#"{
            "bitDepthReduction": false,
            "colorTypeReduction": false,
            "paletteReduction": false,
            "interlaced": true
        }"#,
    )
    .expect("valid mapped options")
    .into_bytes();

    assert_eq!(output[24], 8, "bit depth remains eight-bit");
    assert_eq!(output[25], 2, "color type remains RGB");
    assert_eq!(output[28], 1, "Adam7 is enabled");
    assert_eq!(decode_rgba(&output), decode_rgba(&input));

    let preserved = optimize_png(&input, r#"{"interlaced":null}"#)
        .expect("null preserves input interlacing")
        .into_bytes();
    assert_eq!(preserved[28], input[28]);
}

#[test]
fn accepts_level_seven_as_the_documented_closest_oxipng_profile() {
    optimize_png(&rgb_fixture(), r#"{"optimizationLevel":7}"#)
        .expect("OptiPNG level seven is accepted");

    let error = OptipngOptions::from_json(r#"{"optimizationLevel":8}"#)
        .expect_err("out-of-range levels must fail");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_OPTIONS");
}

#[test]
fn level_zero_disables_reductions_like_optipng_nx_nz() {
    let input = rgb_fixture();
    let output = optimize_png(&input, r#"{"optimizationLevel":0}"#)
        .expect("valid level-zero profile")
        .into_bytes();

    assert_eq!(output[24], 8, "bit depth remains eight-bit");
    assert_eq!(output[25], 2, "grayscale RGB remains RGB");
    assert_eq!(decode_rgba(&output), decode_rgba(&input));
}

#[test]
fn rejects_png_dimension_bombs_before_decoding() {
    let mut input = rgb_fixture();
    input[16..20].copy_from_slice(&100_000_u32.to_be_bytes());
    input[20..24].copy_from_slice(&100_000_u32.to_be_bytes());

    let error = optimize_png(&input, "{}").expect_err("dimension bomb must be rejected");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

fn optimize_png(
    input: &[u8],
    options: &str,
) -> imagemin_core::Result<imagemin_core::OptimizationResult> {
    let plugin = OptipngOptions::from_json(options)?;
    optimize(input.to_vec(), &[plugin])
}

fn rgb_fixture() -> Vec<u8> {
    rgb_fixture_impl(false)
}

fn rgb_fixture_with_text() -> Vec<u8> {
    rgb_fixture_impl(true)
}

fn rgb_fixture_impl(with_text: bool) -> Vec<u8> {
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, 16, 16);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    if with_text {
        encoder
            .add_text_chunk("Comment".to_owned(), "removed by -strip all".to_owned())
            .expect("valid text chunk");
    }
    let mut writer = encoder.write_header().expect("valid PNG header");
    let pixels: Vec<_> = (0..16)
        .flat_map(|y| {
            (0..16).flat_map(move |x| {
                let value = if (x + y) % 2 == 0 { 0 } else { 255 };
                [value, value, value]
            })
        })
        .collect();
    writer
        .write_image_data(&pixels)
        .expect("valid PNG image data");
    writer.finish().expect("valid PNG trailer");

    output
}

fn apng_fixture() -> Vec<u8> {
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, 4, 4);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_animated(2, 3).expect("valid animation control");
    encoder
        .set_frame_delay(1, 10)
        .expect("valid default frame delay");
    let mut writer = encoder.write_header().expect("valid APNG header");
    writer
        .write_image_data(&[255; 4 * 4 * 4])
        .expect("valid first frame");
    writer.set_frame_delay(2, 10).expect("valid second delay");
    writer
        .write_image_data(&[0; 4 * 4 * 4])
        .expect("valid second frame");
    writer.finish().expect("valid APNG trailer");

    output
}

fn apng_metadata(input: &[u8]) -> (Vec<Vec<u8>>, usize) {
    let mut controls = Vec::new();
    let mut frame_data_chunks = 0;
    let mut offset = 8;
    while offset + 12 <= input.len() {
        let length = u32::from_be_bytes(input[offset..offset + 4].try_into().unwrap()) as usize;
        let chunk_type = &input[offset + 4..offset + 8];
        let data = &input[offset + 8..offset + 8 + length];
        if chunk_type == b"acTL" || chunk_type == b"fcTL" {
            controls.push(data.to_vec());
        } else if chunk_type == b"fdAT" {
            frame_data_chunks += 1;
        }
        offset += 12 + length;
    }

    (controls, frame_data_chunks)
}

fn contains_chunk(input: &[u8], expected: [u8; 4]) -> bool {
    let mut offset = 8;
    while offset + 12 <= input.len() {
        let length = u32::from_be_bytes(input[offset..offset + 4].try_into().unwrap()) as usize;
        let chunk_type = &input[offset + 4..offset + 8];
        if chunk_type == expected {
            return true;
        }
        offset += 12 + length;
    }

    false
}

fn corrupt_chunk_crc(mut input: Vec<u8>, expected: [u8; 4]) -> Vec<u8> {
    let mut offset = 8;
    while offset + 12 <= input.len() {
        let length = u32::from_be_bytes(input[offset..offset + 4].try_into().unwrap()) as usize;
        if input[offset + 4..offset + 8] == expected {
            input[offset + 8 + length] ^= 0xff;
            return input;
        }
        offset += 12 + length;
    }
    panic!("missing PNG chunk")
}

fn tiny_png() -> Vec<u8> {
    vec![
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5,
        0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x64,
        0xf8, 0x0f, 0x00, 0x01, 0x05, 0x01, 0x01, 0x27, 0x18, 0xe3, 0x66, 0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]
}

fn decode_rgba(input: &[u8]) -> (u32, u32, Vec<u8>) {
    let mut decoder = Decoder::new(Cursor::new(input));
    decoder.set_transformations(Transformations::EXPAND | Transformations::STRIP_16);
    let mut reader = decoder.read_info().expect("decodable PNG");
    let mut buffer = vec![0; reader.output_buffer_size().expect("bounded output")];
    let info = reader.next_frame(&mut buffer).expect("decodable PNG frame");
    let pixels = &buffer[..info.buffer_size()];
    let rgba = match info.color_type {
        ColorType::Rgba => pixels.to_vec(),
        ColorType::Rgb => pixels
            .chunks_exact(3)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        ColorType::Grayscale => pixels
            .iter()
            .flat_map(|value| [*value, *value, *value, 255])
            .collect(),
        ColorType::GrayscaleAlpha => pixels
            .chunks_exact(2)
            .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
            .collect(),
        ColorType::Indexed => panic!("EXPAND must resolve indexed pixels"),
    };

    (info.width, info.height, rgba)
}
