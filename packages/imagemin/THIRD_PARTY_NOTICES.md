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

The `mozjpeg()` and `jpegtran()` compatibility adapters execute MozJPEG 4.1.1
`cjpeg` and `jpegtran` executables from the current
`@imagemin-rs/sidecars-*` optional package. Both executables come from one
pinned Mozilla MozJPEG source archive and are not linked into the imagemin-rs
native addon. Each platform package carries the upstream MozJPEG and IJG
license texts, the source archive SHA-256 value, and a separate binary
provenance manifest.

`mozjpeg@8.0.0` and `jpegtran-bin@7.0.0` remain development-only compatibility
oracles. Production installation does not use their runtime download or
install-time compilation paths.

Source and license information:

- https://github.com/imagemin/mozjpeg-bin
- https://github.com/imagemin/jpegtran-bin
- https://github.com/mozilla/mozjpeg

The `webp()` compatibility adapter executes the cwebp 1.6.0 executable from the
current `@imagemin-rs/sidecars-*` optional package. It is built from pinned
libwebp, zlib, libpng, libjpeg-turbo, and libtiff sources and is not linked into
the imagemin-rs native addon. Each platform package carries the complete
upstream license files, the libwebp patent grant, source archive SHA-256 values,
and the binary provenance manifest.

`cwebp-bin@8.0.0` and its libwebp 1.2.1 executable remain development-only
compatibility oracles. Production installation does not use their runtime
download or install-time compilation path.

Source and license information:

- https://github.com/imagemin/cwebp-bin
- https://github.com/webmproject/libwebp
- https://github.com/madler/zlib
- https://github.com/pnggroup/libpng
- https://github.com/libjpeg-turbo/libjpeg-turbo
- https://gitlab.com/libtiff/libtiff

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
