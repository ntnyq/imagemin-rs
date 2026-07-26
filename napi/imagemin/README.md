# @imagemin-rs/binding

Private napi-rs loader used by `imagemin-rs`. Applications should depend on
`imagemin-rs`, not this package directly.

The loader selects an optional platform package at runtime and rejects missing
or unsupported native artifacts with the original napi-rs diagnostics.
