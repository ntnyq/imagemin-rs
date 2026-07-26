use imagemin::{ImageFormat, NativePluginDescriptor, optimize};

const ONE_PIXEL_PNG_HEX: &str = concat!(
    "89504e470d0a1a0a",
    "0000000d4948445200000001000000010804000000b51c0c02",
    "0000000b4944415478da6364f80f00010501012718e366",
    "0000000049454e44ae426082"
);

#[test]
fn optimizes_png_without_growing_it() {
    let input = decode_hex(ONE_PIXEL_PNG_HEX);
    let plugin =
        NativePluginDescriptor::from_json("oxipng", r#"{"optimizationLevel":2,"strip":"safe"}"#)
            .expect("valid options");
    let result = optimize(input.clone(), &[plugin]).expect("valid PNG");

    assert_eq!(result.format(), ImageFormat::Png);
    assert_eq!(result.input_bytes(), input.len());
    assert!(result.output_bytes() <= input.len());
    assert_eq!(result.steps().len(), 1);

    let output = result.into_bytes();
    oxipng::optimize_from_memory(&output, &oxipng::Options::default())
        .expect("optimized output remains a valid PNG");
}

#[test]
fn skips_a_plugin_for_an_unmatched_format() {
    let plugin = NativePluginDescriptor::from_json("oxipng", "{}").expect("valid options");
    let input = b"not a known image".to_vec();
    let result = optimize(input.clone(), &[plugin]).expect("unknown formats are a no-op");

    assert_eq!(result.format(), ImageFormat::Unknown);
    assert!(!result.steps()[0].changed);
    assert_eq!(result.into_bytes(), input);
}

#[test]
fn keeps_empty_unmatched_input_compatible_with_function_plugins() {
    let plugin = NativePluginDescriptor::from_json("oxipng", "{}").expect("valid options");
    let result = optimize(Vec::new(), &[plugin]).expect("empty non-PNG input is a no-op");

    assert_eq!(result.format(), ImageFormat::Unknown);
    assert_eq!(result.output_bytes(), 0);
    assert!(!result.steps()[0].changed);
}

#[test]
fn rejects_an_unknown_native_plugin() {
    let error = NativePluginDescriptor::from_json("missing", "{}")
        .expect_err("unknown plugins must not be ignored");

    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_UNSUPPORTED_PLUGIN");
}

#[test]
fn reports_malformed_target_images_as_codec_errors() {
    let plugin = NativePluginDescriptor::from_json("oxipng", "{}").expect("valid options");
    let error = optimize(b"\x89PNG\r\n\x1a\ninvalid".to_vec(), &[plugin])
        .expect_err("a malformed PNG must not be treated as an unmatched format");

    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_CODEC");
}

#[test]
fn rejects_unknown_options() {
    let error = NativePluginDescriptor::from_json("oxipng", r#"{"quality":80}"#)
        .expect_err("unknown options must not be ignored");

    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_OPTIONS");
}

fn decode_hex(input: &str) -> Vec<u8> {
    input
        .as_bytes()
        .chunks_exact(2)
        .map(|digits| {
            let digits = std::str::from_utf8(digits).expect("ASCII hex");
            u8::from_str_radix(digits, 16).expect("valid hex")
        })
        .collect()
}
