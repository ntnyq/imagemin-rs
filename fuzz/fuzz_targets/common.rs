use imagemin::{ImageFormat, NativePluginDescriptor, optimize};

pub fn exercise(plugin_name: &str, options_json: &str, input: &[u8]) {
    let plugin = NativePluginDescriptor::from_json(plugin_name, options_json)
        .expect("fuzz harness options must remain valid");
    let input_format = ImageFormat::detect(input);
    let input_bytes = input.len();

    let Ok(result) = optimize(input.to_vec(), std::slice::from_ref(&plugin)) else {
        return;
    };

    assert_eq!(result.input_bytes(), input_bytes);
    assert_eq!(result.steps().len(), 1);
    assert_eq!(result.steps()[0].plugin, plugin_name);
    assert_eq!(result.steps()[0].input_bytes, input_bytes);
    assert_eq!(result.steps()[0].output_bytes, result.output_bytes());

    let output_format = result.format();
    if input_format != ImageFormat::Unknown {
        assert_eq!(output_format, input_format);
    }

    let output = result.into_bytes();
    let replay = optimize(output, &[plugin]);
    assert!(replay.is_ok(), "an optimizer must accept its own output");
}
