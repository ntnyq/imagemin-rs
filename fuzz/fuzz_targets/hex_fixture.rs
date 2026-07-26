use std::borrow::Cow;

pub fn decode(data: &[u8]) -> Cow<'_, [u8]> {
    let hex_digits = data.iter().filter(|byte| byte.is_ascii_hexdigit()).count();
    let looks_like_hex = data.len() >= 16 && hex_digits.saturating_mul(10) >= data.len() * 9;

    if !looks_like_hex {
        return Cow::Borrowed(data);
    }

    let mut decoded = Vec::with_capacity(hex_digits / 2);
    let mut high_nibble = None;

    for byte in data.iter().filter_map(|byte| hex_value(*byte)) {
        if let Some(high) = high_nibble.take() {
            decoded.push((high << 4) | byte);
        } else {
            high_nibble = Some(byte);
        }
    }

    Cow::Owned(decoded)
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}
