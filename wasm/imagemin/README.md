# @imagemin-rs/wasm

Browser WebAssembly runtime for imagemin-rs.

```ts
import { initWasm, optimize, oxipng } from "@imagemin-rs/wasm";

await initWasm();

const result = await optimize(input, {
  plugins: [oxipng({ optimizationLevel: 3 })],
});
```

The package is asynchronous and memory-only. It supports `giflossless`,
`oxipng`, `optipng`, and `svgm`; it does not include Node.js paths, globbing,
CLI commands, native bindings, or executable sidecars.

See the [Browser WASM API](https://imagemin-rs.ntnyq.dev/api/wasm) for the
complete contract.

## Build from source

Install the `wasm32-unknown-unknown` rustup target and `wasm-pack`, then run
`pnpm --filter @imagemin-rs/wasm build`. The build launcher prefers the active
rustup toolchain. On macOS it also detects Homebrew LLVM because Apple Clang
does not ship a WebAssembly backend.

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
