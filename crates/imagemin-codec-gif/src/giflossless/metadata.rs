use imagemin_core::Result;

use super::support::{codec_error, invalid_input};

const MAX_EXTENSION_BYTES: usize = 16 * 1024 * 1024;

pub(super) fn collect_metadata_extensions(data: &[u8]) -> Result<Vec<(u8, Vec<Vec<u8>>)>> {
    let mut found = Vec::new();
    let mut extension_bytes = 0_usize;
    let mut position = 6;
    let flags = *data
        .get(position + 4)
        .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?;
    position += 7;
    if flags & 0x80 != 0 {
        position += 3 * (1 << ((flags & 0x07) + 1));
    }

    loop {
        match *data
            .get(position)
            .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?
        {
            0x3B => break,
            0x2C => {
                let flags = *data
                    .get(position + 9)
                    .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?;
                position += 10;
                if flags & 0x80 != 0 {
                    position += 3 * (1 << ((flags & 0x07) + 1));
                }
                position += 1;
                position = skip_sub_blocks(data, position)
                    .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?;
            }
            0x21 => {
                let label = *data
                    .get(position + 1)
                    .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?;
                position += 2;
                let mut blocks = Vec::new();
                while let Some(&length) = data.get(position) {
                    position += 1;
                    if length == 0 {
                        break;
                    }
                    let block = data
                        .get(position..position + usize::from(length))
                        .ok_or_else(|| codec_error("malformed GIF block structure".to_owned()))?;
                    extension_bytes = extension_bytes
                        .checked_add(block.len())
                        .ok_or_else(|| invalid_input("GIF extension size overflows".to_owned()))?;
                    if extension_bytes > MAX_EXTENSION_BYTES {
                        return Err(invalid_input(format!(
                            "GIF extensions exceed the {MAX_EXTENSION_BYTES} byte limit"
                        )));
                    }
                    blocks.push(block.to_vec());
                    position += usize::from(length);
                }
                let is_loop = label == 0xFF
                    && blocks.first().is_some_and(|block| {
                        block.starts_with(b"NETSCAPE2.0") || block.starts_with(b"ANIMEXTS1.0")
                    });
                if label != 0xF9 && !is_loop {
                    found.push((label, blocks));
                }
            }
            _ => return Err(codec_error("malformed GIF block structure".to_owned())),
        }
    }

    Ok(found)
}

fn skip_sub_blocks(data: &[u8], mut position: usize) -> Option<usize> {
    while let Some(&length) = data.get(position) {
        position += 1;
        if length == 0 {
            return Some(position);
        }
        position = position.checked_add(usize::from(length))?;
        if position > data.len() {
            return None;
        }
    }
    None
}
