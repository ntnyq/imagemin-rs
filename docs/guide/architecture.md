# Architecture

## Three language layers

```text
packages/imagemin
  imagemin-compatible interface, file I/O, JS plugins, error context
          │ private NativePluginDescriptor
          ▼
napi/imagemin
  Buffer conversion, AsyncTask scheduling, Rust error mapping
          │ Vec<u8> + typed options
          ▼
crates/imagemin (facade)
  descriptor registry and stable re-exports
          │
          ├─ imagemin-core: assets, formats, errors, plugin trait, pipeline/stats
          ├─ imagemin-codec-png: Oxipng and OptiPNG-compatible paths
          ├─ imagemin-codec-gif: analysis, encoding, metadata, resource policy
          └─ imagemin-codec-svg: XML policy and SVGM
```

Rust modules do not know about globs, paths, or Node.js. JavaScript modules do
not know about codec FFI or thread details. The N-API adapter remains a thin
language seam.

## Why AsyncTask

Image compression is CPU-intensive. JavaScript `async` changes the return
shape but cannot stop a synchronous native function from blocking the event
loop. Native plugins therefore execute in `AsyncTask::compute` and construct
JavaScript results during `resolve`.

## Plugin fusion

Native factories still return ordinary imagemin-compatible functions. A
private `WeakMap` stores their descriptors:

```text
[native A, native B, JS C, native D]
        │                    │
        └─ AsyncTask #1      └─ AsyncTask #2
                  JS C runs strictly between them
```

Failure to recognize a descriptor only loses fusion performance; it does not
change correctness. Full SVGO configuration can contain JavaScript functions
and cannot be serialized, so `svgo()` stays at the JavaScript compatibility
seam while the closed `svgm()` profile participates in native fusion.

## Crate boundaries

The Rust workspace is divided by dependency, license, resource-policy, and
build boundaries rather than one crate per function. A thin facade re-exports
the codec-independent core and grouped PNG, GIF, and SVG codec crates.

See [ADR 0001](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0001-architecture.md)
and [ADR 0008](https://github.com/ntnyq/imagemin-rs/blob/main/internal-docs/adr/0008-rust-crate-boundaries.md)
for the complete decisions.
