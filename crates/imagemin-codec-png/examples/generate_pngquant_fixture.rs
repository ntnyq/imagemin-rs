use png::{BitDepth, ColorType, Compression, Encoder};

fn main() {
    const WIDTH: u32 = 128;
    const HEIGHT: u32 = 96;
    let mut pixels = Vec::with_capacity((WIDTH * HEIGHT * 4) as usize);

    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let alpha = match x {
                0..=7 => u8::try_from(x * 32).expect("alpha fits u8"),
                8..=119 => 255,
                _ => u8::try_from((127 - x) * 32).expect("alpha fits u8"),
            };
            pixels.extend_from_slice(&[
                u8::try_from((x * 29 + y * 17 + x * y) % 256).expect("red fits u8"),
                u8::try_from((x * 7 + y * 31 + (x ^ y) * 3) % 256).expect("green fits u8"),
                u8::try_from((x * 13 + y * 11 + x * y * 5) % 256).expect("blue fits u8"),
                alpha,
            ]);
        }
    }

    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, WIDTH, HEIGHT);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_compression(Compression::Balanced);
    encoder
        .add_text_chunk(
            "Generator".to_owned(),
            "imagemin-rs pngquant corpus".to_owned(),
        )
        .expect("valid text metadata");
    let mut writer = encoder.write_header().expect("valid PNG header");
    writer.write_image_data(&pixels).expect("valid PNG pixels");
    writer.finish().expect("valid PNG trailer");

    for byte in output {
        print!("{byte:02x}");
    }
    println!();
}
