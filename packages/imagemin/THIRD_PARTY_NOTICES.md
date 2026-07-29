# Third-party notices

`imagemin-rs` is MIT licensed. Its `gifsicle()` compatibility adapter executes
Gifsicle 1.96 from the current `@imagemin-rs/sidecar-gifsicle-*` optional
package as a child process.

Gifsicle is Copyright (C) 1997-2025 Eddie Kohler and is distributed under the
GNU General Public License version 2 only. The executable is not linked into
the imagemin-rs native addon. Each platform package includes the complete
`COPYING` file, exact source URL and SHA-256 value, and a binary provenance
manifest.

`gifsicle@5.3.0` remains a development-only compatibility oracle. Production
installation does not use its runtime download or install-time compilation
path.

Source and license information:

- https://github.com/imagemin/gifsicle-bin
- https://github.com/kohler/gifsicle
- https://www.lcdf.org/gifsicle/

The `pngquant()` compatibility adapter executes pngquant 3.0.3 from the current
`@imagemin-rs/sidecar-pngquant-*` optional package. pngquant and its pinned
libimagequant source are distributed under the GNU General Public License
version 3 or later. The executable is not linked into the imagemin-rs native
addon. Each platform package includes the complete pngquant and libimagequant
`COPYRIGHT` files, exact source URLs and SHA-256 values, and a binary provenance
manifest.

Starting with `0.1.0-rc.7`, the matching `imagemin-rs` GitHub Release also
attaches the exact Gifsicle, pngquant, and libimagequant source archives, a
SHA-256 manifest, and links to the tagged build scripts and pins. These assets
supplement the notices inside each npm package; they do not replace the
maintainer's responsibility to confirm all corresponding-source obligations.

`pngquant-bin@9.0.0` remains a development-only compatibility oracle.
Production installation does not use its runtime download or install-time
compilation path.

Source and license information:

- https://github.com/imagemin/pngquant-bin
- https://github.com/kornelski/pngquant
- https://github.com/ImageOptim/libimagequant

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

This package reproduces libaom's exact BSD 2-Clause copyright license and
Alliance for Open Media Patent License 1.0 in `licenses/aom-LICENSE` and
`licenses/aom-PATENTS`. The patent license grants rights directly from its
licensors, requires the license to accompany binary implementations, and
contains reciprocity and defensive-termination conditions. Receiving this
package does not create patent rights from imagemin-rs or from an intermediary.

Sharp supports rebuilding against a compatible globally installed libvips.
The corresponding upstream source, build configuration, and replacement
instructions for the pinned native dependency are maintained at:

- https://github.com/lovell/sharp-libvips/tree/v1.3.2
- https://github.com/lovell/sharp-libvips/releases/tag/v1.3.2
- https://sharp.pixelplumbing.com/install/#custom-libvips

Sharp is an exact optional peer and is not installed by the default
imagemin-rs dependency closure. Projects that explicitly install it must
preserve Sharp's Apache license, the AOM license copies above, and each
installed platform package's licensing manifest; record exact native package
versions and hashes; and review the LGPL shared-library/source path. Making
Sharp a default dependency again requires a renewed distribution audit.

Source and license information:

- https://github.com/lovell/sharp
- https://github.com/lovell/sharp-libvips
- https://github.com/strukturag/libheif
- https://aomedia.googlesource.com/aom/
- https://aomedia.org/license/patent-license/
