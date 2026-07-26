use imagemin_core::{ImageAsset, ImageminError, NativePlugin, PluginOutcome, Result, optimize};

struct TestPlugin {
    name: &'static str,
    suffix: &'static [u8],
    fails: bool,
}

impl NativePlugin for TestPlugin {
    fn name(&self) -> &'static str {
        self.name
    }

    fn optimize(&self, asset: ImageAsset) -> Result<PluginOutcome> {
        if self.fails {
            return Err(ImageminError::Codec {
                plugin: self.name,
                message: "expected failure".to_owned(),
            });
        }

        let mut bytes = asset.into_bytes();
        bytes.extend_from_slice(self.suffix);
        Ok(PluginOutcome::new(ImageAsset::new(bytes), true))
    }
}

#[test]
fn runs_open_plugins_in_order_and_accounts_for_each_step() {
    let plugins = [
        TestPlugin {
            name: "first",
            suffix: b"-one",
            fails: false,
        },
        TestPlugin {
            name: "second",
            suffix: b"-two",
            fails: false,
        },
    ];

    let result = optimize(b"input".to_vec(), &plugins).expect("test plugins succeed");

    assert_eq!(result.input_bytes(), 5);
    assert_eq!(result.output_bytes(), 13);
    assert_eq!(result.steps()[0].plugin, "first");
    assert_eq!(result.steps()[0].input_bytes, 5);
    assert_eq!(result.steps()[0].output_bytes, 9);
    assert_eq!(result.steps()[1].plugin, "second");
    assert_eq!(result.steps()[1].input_bytes, 9);
    assert_eq!(result.steps()[1].output_bytes, 13);
    assert_eq!(result.into_bytes(), b"input-one-two");
}

#[test]
fn stops_at_the_first_plugin_error() {
    let plugins = [
        TestPlugin {
            name: "failing",
            suffix: b"",
            fails: true,
        },
        TestPlugin {
            name: "unreached",
            suffix: b"-unexpected",
            fails: false,
        },
    ];

    let error = optimize(b"input".to_vec(), &plugins).expect_err("first plugin must fail");

    assert_eq!(error.code().as_str(), "ERR_IMAGEMIN_CODEC");
}
