use imagemin_codec_svg::SvgmOptions;
use imagemin_core::{ImageFormat, optimize};
use resvg::{
    tiny_skia::{Pixmap, Transform},
    usvg::{Options, Tree},
};

const BASIC_ICON: &[u8] = include_bytes!("../../../fixtures/svg/basic-icon.svg");
const CSS_SELECTORS: &[u8] = include_bytes!("../../../fixtures/svg/css-selectors.svg");
const DEFS_USE: &[u8] = include_bytes!("../../../fixtures/svg/defs-use.svg");
const ANIMATION: &[u8] = include_bytes!("../../../fixtures/svg/animation.svg");
const FIGMA_TRANSFORMS: &[u8] =
    include_bytes!("../../../fixtures/svg/upstream-figma-transforms.svg");
const ILLUSTRATOR: &[u8] = include_bytes!("../../../fixtures/svg/upstream-illustrator.svg");

#[test]
fn safe_preset_optimizes_without_removing_accessibility_or_view_box() {
    let result = optimize_svgm(BASIC_ICON, "{}").expect("valid SVG");
    let output = String::from_utf8(result.into_bytes()).expect("UTF-8 SVG");

    assert!(output.len() < BASIC_ICON.len());
    assert!(output.contains("<title>Accessible status icon</title>"));
    assert!(output.contains("viewBox=\"0 0 64 64\""));
    assert!(!output.contains("editor-only metadata"));
    assert!(!output.contains("Exported by"));
}

#[test]
fn safe_preset_is_pixel_equivalent_at_intrinsic_size() {
    for input in [
        BASIC_ICON,
        DEFS_USE,
        CSS_SELECTORS,
        FIGMA_TRANSFORMS,
        ILLUSTRATOR,
    ] {
        let output = optimize_svgm(input, "{}").expect("valid SVG").into_bytes();

        assert_eq!(render(&output), render(input));
    }
}

#[test]
fn safe_preset_preserves_animation_structure() {
    let output = String::from_utf8(
        optimize_svgm(ANIMATION, "{}")
            .expect("valid animated SVG")
            .into_bytes(),
    )
    .expect("UTF-8 SVG");

    assert!(output.contains("<animate"));
    assert!(output.contains("repeatCount=\"indefinite\""));
    assert!(output.contains("values=\"12;52;12\""));
}

#[test]
fn validates_and_applies_native_pass_overrides() {
    let output = String::from_utf8(
        optimize_svgm(BASIC_ICON, r#"{"passOverrides":{"removeComments":false}}"#)
            .expect("valid pass override")
            .into_bytes(),
    )
    .expect("UTF-8 SVG");

    assert!(output.contains("Exported by"));

    let error = SvgmOptions::from_json(r#"{"passOverrides":{"notARealPass":true}}"#)
        .expect_err("unknown passes must not be ignored");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_OPTIONS");
}

#[test]
fn rejects_dtd_and_entity_declarations() {
    let input = br#"<?xml version="1.0"?>
        <!DOCTYPE svg [<!ENTITY payload "expanded">]>
        <svg xmlns="http://www.w3.org/2000/svg"><text>&payload;</text></svg>"#;
    let error = optimize_svgm(input, "{}").expect_err("DTD input must be rejected");

    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

#[test]
fn rejects_inputs_above_native_resource_limits() {
    let deeply_nested = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\">{}{}</svg>",
        "<g>".repeat(256),
        "</g>".repeat(256)
    );
    let error = optimize_svgm(deeply_nested.as_bytes(), "{}")
        .expect_err("deeply nested input must be rejected");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");

    let too_many_nodes = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\">{}</svg>",
        "<path/>".repeat(100_000)
    );
    let error = optimize_svgm(too_many_nodes.as_bytes(), "{}")
        .expect_err("oversized AST input must be rejected");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");

    let mut too_many_bytes = b"<svg xmlns=\"http://www.w3.org/2000/svg\">".to_vec();
    too_many_bytes.resize(16 * 1024 * 1024 + 1, b' ');
    let error =
        optimize_svgm(&too_many_bytes, "{}").expect_err("oversized byte input must be rejected");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

#[test]
fn terminates_on_unconsumable_path_data_characters() {
    // svgm-core 0.3.8 looped forever when an argument-group boundary held a
    // character that is neither a command letter nor a number start; the
    // vendored parse_path patch turns that into a failed parse instead. Found
    // by the svg_pipeline fuzz target on a mutated Illustrator fixture.
    for d in ["M0 0 e", "M0 0 &#38;3", "M0 0c0,0,0,0,0,0 $1 2"] {
        let input = format!(r#"<svg xmlns="http://www.w3.org/2000/svg"><path d="{d}"/></svg>"#);
        let output = String::from_utf8(
            optimize_svgm(input.as_bytes(), "{}")
                .expect("garbage path data must not fail the whole document")
                .into_bytes(),
        )
        .expect("UTF-8 SVG");

        assert!(output.contains("<path"));
    }
}

#[test]
fn rejects_documents_that_stop_being_svg_after_optimization() {
    // A truncated `<svg` serializes to an empty string in svgm-core and a
    // non-svg root loses the detectable `<svg` prefix; both must be codec
    // errors instead of silent data loss or a format flip.
    for input in [
        &b"<svg"[..],
        &br#"<?xml version="1.0"?><html><svg/></html>"#[..],
    ] {
        let error = optimize_svgm(input, "{}").expect_err("degenerate SVG must fail");
        assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_CODEC");
    }
}

#[test]
fn preserves_non_ascii_style_text_without_amplification() {
    // svgm-core 0.3.8 minifyStyles re-encoded every non-ASCII byte through a
    // `byte as char` cast, corrupting the text and quadrupling it on each
    // fixed-point iteration (~×10^6 per call). The vendored patch copies
    // bytes; the optimizer must now be size-stable and keep the characters.
    let input = concat!(
        r#"<svg xmlns="http://www.w3.org/2000/svg">"#,
        r#"<style>.ǎccent { fill: #008000; }</style>"#,
        r#"<rect class="ǎccent" width="4" height="4"/></svg>"#,
    )
    .as_bytes();

    let first = optimize_svgm(input, "{}").expect("valid SVG").into_bytes();
    assert!(first.len() <= input.len());
    let text = String::from_utf8(first.clone()).expect("UTF-8 SVG");
    assert!(text.contains("ǎccent"));

    let second = optimize_svgm(&first, "{}").expect("valid SVG").into_bytes();
    assert_eq!(second, first, "optimizing its own output must be stable");
}

#[test]
fn rejects_invalid_utf8_after_the_detection_window() {
    let mut input = b"<svg xmlns=\"http://www.w3.org/2000/svg\">".to_vec();
    input.resize(4097, b' ');
    input.push(0xff);
    input.extend_from_slice(b"</svg>");

    let error = optimize_svgm(&input, "{}").expect_err("invalid UTF-8 must be rejected");
    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_INVALID_INPUT");
}

#[test]
fn skips_non_svg_input() {
    let input = b"not an SVG".to_vec();
    let result = optimize_svgm(&input, "{}").expect("unmatched input is a no-op");

    assert_eq!(result.format(), ImageFormat::Unknown);
    assert!(!result.steps()[0].changed);
    assert_eq!(result.into_bytes(), input);
}

fn optimize_svgm(
    input: &[u8],
    options: &str,
) -> imagemin_core::Result<imagemin_core::OptimizationResult> {
    let plugin = SvgmOptions::from_json(options)?;
    optimize(input.to_vec(), &[plugin])
}

fn render(svg: &[u8]) -> Vec<u8> {
    let tree = Tree::from_data(svg, &Options::default()).expect("renderable SVG");
    let size = tree.size().to_int_size();
    let mut pixmap = Pixmap::new(size.width(), size.height()).expect("non-empty SVG canvas");

    resvg::render(&tree, Transform::identity(), &mut pixmap.as_mut());
    pixmap.take()
}
