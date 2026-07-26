#![no_main]

mod common;
mod hex_fixture;

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let input = hex_fixture::decode(data);
    common::exercise("giflossless", "{}", &input);
    common::exercise("giflossless", r#"{"strip":true}"#, &input);
});
