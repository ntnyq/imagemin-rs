# Third-party notices

`imagemin-rs` is MIT licensed. Its `gifsicle()` compatibility adapter executes
the separately installed `gifsicle@5.3.0` package as a child process.

Gifsicle is Copyright (C) 1997-2021 Eddie Kohler and is distributed under the
GNU General Public License version 2. The npm dependency contains its license
and corresponding source archive under `vendor/source`. The executable is not
linked into the imagemin-rs native addon.

Source and license information:

- https://github.com/imagemin/gifsicle-bin
- https://github.com/kohler/gifsicle

The `pngquant()` compatibility adapter executes the separately installed
`pngquant-bin@9.0.0` package as a child process. pngquant 3.0.3 and libimagequant
are distributed under the GNU General Public License version 3 or later. The
executable is not linked into the imagemin-rs native addon. The npm dependency
contains GPL license material under `vendor/source`, but its source archive is
pngquant 2.16.0 and does not correspond to every downloaded prebuilt binary.
Release artifacts using pngquant 3.0.3 must separately publish the exact
pngquant/libimagequant source revision, GPL text and binary/source SHA-256
manifest. The bundled archive must not be represented as corresponding source.

Source and license information:

- https://github.com/imagemin/pngquant-bin
- https://github.com/kornelski/pngquant

The Rust GIF implementation was adapted from the MIT-licensed delta planning
algorithm in `losslessly@0.1.1`, Copyright (c) 2026 Krystian Doroszewicz.

The `mozjpeg()` compatibility adapter executes the separately installed
`mozjpeg@8.0.0` cjpeg executable as a child process. The npm wrapper is MIT
licensed; the codec binary contains code under the IJG license, BSD 3-Clause,
and zlib-style licenses. The executable is not linked into the imagemin-rs
native addon. The current compatibility artifact reports MozJPEG 3.2
(build 20180508). Release artifacts must include the exact codec source,
license texts, build provenance and a binary/source SHA-256 manifest.

Source and license information:

- https://github.com/imagemin/mozjpeg-bin
- https://github.com/mozilla/mozjpeg

The `jpegtran()` compatibility adapter executes the separately installed
`jpegtran-bin@7.0.0` executable as a child process. The npm wrapper is MIT
licensed; libjpeg-turbo combines the IJG license, BSD 3-Clause, and zlib-style
licenses. The executable is not linked into the imagemin-rs native addon. The
current compatibility artifact reports libjpeg-turbo 1.5.1 (build 20161213).
Release artifacts must preserve the complete upstream notices and record the
exact source and binary hashes.

Source and license information:

- https://github.com/imagemin/jpegtran-bin
- https://github.com/libjpeg-turbo/libjpeg-turbo

The `webp()` compatibility adapter executes the separately installed
`cwebp-bin@8.0.0` executable as a child process. The npm wrapper is MIT
licensed. Its cwebp/libwebp 1.2.1 codec is Copyright (c) 2010 Google Inc. and
distributed under the BSD 3-Clause license with an additional patent grant in
the upstream `PATENTS` file. The executable is not linked into the imagemin-rs
native addon.

The development macOS artifact reports cwebp 1.2.1 and is x86_64. Final
release artifacts must use project-built, security-reviewed native platform
binaries and include the exact `COPYING`, `PATENTS`, source archive/commit,
patches, build provenance, SBOM, and binary/source SHA-256 manifest. Runtime
downloads and install-time compilation fallback are not an accepted release
path.

Source and license information:

- https://github.com/imagemin/cwebp-bin
- https://github.com/webmproject/libwebp

The `avif()` compatibility adapter starts a separate Node.js process that loads
the separately installed `sharp@0.35.3` package. Sharp is distributed under the
Apache License 2.0. Its platform native addon and `@img/sharp-libvips-*`
dependency are not linked into the imagemin-rs napi addon.

The current `@img/sharp-libvips-*@1.3.2` artifacts contain libvips 8.18.3,
libheif 1.23.1 and libaom 3.14.1. The platform package is declared
LGPL-3.0-or-later and its licensing manifest identifies libvips and libheif as
LGPLv3, and libaom as BSD 2-Clause plus the Alliance for Open Media Patent
License 1.0. It also contains decoders and support libraries under their own
licenses; the complete platform-specific manifest shipped by
`@img/sharp-libvips-*` is authoritative.

Final release verification must preserve Sharp's Apache license and each
installed platform package's licensing manifest, record exact native package
versions and hashes, generate an SBOM, and review the LGPL replacement/source
requirements and AOM patent terms. The product package must not copy only this
summary while omitting the dependency's complete notices.

Source and license information:

- https://github.com/lovell/sharp
- https://github.com/lovell/sharp-libvips
- https://github.com/strukturag/libheif
- https://aomedia.googlesource.com/aom/
