# Browser WASM example

Runnable Vite example for `@imagemin-rs/wasm`. It keeps file bytes in the
browser, transfers work to a module Web Worker, supports hard cancellation by
terminating that Worker, and exposes the optimized bytes as a local download.

From the repository root:

```sh
pnpm install
pnpm example:browser:dev
```

Create the production bundle with:

```sh
pnpm example:browser:build
```

The build performs a TypeScript check and emits separate application, Worker,
and hashed WASM assets. See the
[Browser and Web Worker Guide](https://imagemin-rs.ntnyq.dev/guide/browser-wasm)
for deployment and error-handling details.
