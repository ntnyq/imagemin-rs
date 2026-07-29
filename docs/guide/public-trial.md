# 1.0 Public Trial

The first stable release is targeted for **August 17, 2026**. That date is
conditional on one complete 35-package release candidate remaining public for
14 consecutive days without a release-blocking defect.

The trial version is `0.1.0-rc.9`. All 35 packages, including WASM, bindings,
and platform sidecars, are available under npm `next`. Registry closure and
fresh-install verification completed at **2026-07-30 06:29 +08:00**, which is
the recorded T0. The earliest eligible instant is
**2026-08-13 06:29 +08:00**, provided the evidence minimum is complete and no
P0/P1 resets the clock.

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
Submit results through the
[public feedback ledger](https://github.com/ntnyq/imagemin-rs/issues/4).

The evidence minimum is three independent consumer reports across at least two
OS families. Together they must cover default installation without Sharp,
AVIF after explicit `sharp@0.35.3` installation, and browser or Worker WASM.

## What blocks 1.0

A security issue, data loss/corruption, supported-platform installation
failure, crash, incorrect codec result, mismatched package version, missing
license/source material, or broken WASM deployment blocks stable. A fix for
one of these issues requires a new RC and restarts the 14-day observation
window.

Minor documentation and ergonomics issues are still welcome but normally do
not reset the clock. The current dates and gate status are maintained in the
[Roadmap](./roadmap.md).
