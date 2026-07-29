# 1.0 Public Trial

The first stable release is targeted for **August 17, 2026**. That date is
conditional on one complete 35-package release candidate remaining public for
14 consecutive days without a release-blocking defect.

The planned trial version is `0.1.0-rc.9`. The trial starts only after that
exact version is available for the root package, WASM package, bindings, and
all platform sidecars under the npm `next` tag.

## Join the trial

Install the Node package in a real project:

```sh
pnpm add imagemin-rs@next
```

Run the codecs your application uses. The default install intentionally does
not include Sharp. If you need AVIF, test the second path explicitly:

```sh
pnpm add sharp@0.35.3
```

Browser or Worker users can test:

```sh
pnpm add @imagemin-rs/wasm@next
```

Report the package manager and version, Node/browser version, OS/architecture,
install command, codecs exercised, and whether Sharp was installed. Do not
attach private images; use a minimal synthetic or redistributable fixture.

## What blocks 1.0

A security issue, data loss/corruption, supported-platform installation
failure, crash, incorrect codec result, mismatched package version, missing
license/source material, or broken WASM deployment blocks stable. A fix for
one of these issues requires a new RC and restarts the 14-day observation
window.

Minor documentation and ergonomics issues are still welcome but normally do
not reset the clock. The current dates and gate status are maintained in the
[Roadmap](./roadmap.md).
