#![no_main]

mod common;

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    common::exercise("svgm", "{}", data);
    common::exercise("svgm", r#"{"preset":"default","precision":3}"#, data);
});
