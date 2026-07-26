use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageFormat {
    Png,
    Jpeg,
    Gif,
    Webp,
    Avif,
    Svg,
    Unknown,
}

impl ImageFormat {
    #[must_use]
    pub fn detect(bytes: &[u8]) -> Self {
        if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            return Self::Png;
        }

        if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            return Self::Jpeg;
        }

        if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
            return Self::Gif;
        }

        if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
            return Self::Webp;
        }

        if bytes.len() >= 12
            && &bytes[4..8] == b"ftyp"
            && matches!(&bytes[8..12], b"avif" | b"avis")
        {
            return Self::Avif;
        }

        if looks_like_svg(bytes) {
            return Self::Svg;
        }

        Self::Unknown
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpeg",
            Self::Gif => "gif",
            Self::Webp => "webp",
            Self::Avif => "avif",
            Self::Svg => "svg",
            Self::Unknown => "unknown",
        }
    }
}

impl fmt::Display for ImageFormat {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let sample = bytes.get(..bytes.len().min(4096)).unwrap_or(bytes);
    let sample = sample.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(sample);
    let Ok(text) = std::str::from_utf8(sample) else {
        return false;
    };
    let mut text = text.trim_start();

    // XML comments may precede the root element, both in authored files and in
    // optimizer output that preserves comments while dropping the XML
    // declaration. Skip the comment prologue before looking for `<svg`.
    while let Some(rest) = text.strip_prefix("<!--") {
        let Some(end) = rest.find("-->") else {
            return false;
        };
        text = rest[end + 3..].trim_start();
    }

    text.starts_with("<svg") || (text.starts_with("<?xml") && text.contains("<svg"))
}

#[cfg(test)]
mod tests {
    use super::ImageFormat;

    #[test]
    fn detects_supported_signatures() {
        let cases: &[(&[u8], ImageFormat)] = &[
            (b"\x89PNG\r\n\x1a\nrest", ImageFormat::Png),
            (&[0xff, 0xd8, 0xff, 0xe0], ImageFormat::Jpeg),
            (b"GIF89arest", ImageFormat::Gif),
            (b"RIFF0000WEBPrest", ImageFormat::Webp),
            (b"0000ftypavifrest", ImageFormat::Avif),
            (b"  <svg viewBox='0 0 1 1'/>", ImageFormat::Svg),
            (b"<!-- exported --><svg/>", ImageFormat::Svg),
            (b"<!-- a -->\n<!-- b -->\n<svg/>", ImageFormat::Svg),
        ];

        for (input, expected) in cases {
            assert_eq!(ImageFormat::detect(input), *expected);
        }
    }

    #[test]
    fn reports_unknown_data() {
        for input in [
            &b"not an image"[..],
            &b"<!-- comment --><div/>"[..],
            &b"<!-- unterminated <svg"[..],
        ] {
            assert_eq!(ImageFormat::detect(input), ImageFormat::Unknown);
        }
    }
}
