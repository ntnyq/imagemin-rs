use png::{BitDepth, ColorType, Encoder};

fn main() {
    const WIDTH: u32 = 32;
    const HEIGHT: u32 = 24;
    let mut pixels = Vec::with_capacity((WIDTH * HEIGHT * 4) as usize);
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            pixels.extend_from_slice(&[
                u8::try_from((x * 7 + y * 3) % 256).expect("red channel fits u8"),
                u8::try_from((x / 8 + y / 8) % 2 * 220).expect("green channel fits u8"),
                u8::try_from((x * y) % 256).expect("blue channel fits u8"),
                if (x + y) % 17 == 0 { 160 } else { 255 },
            ]);
        }
    }

    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, WIDTH, HEIGHT);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    encoder
        .add_text_chunk("Generator".to_owned(), "imagemin-rs".to_owned())
        .expect("valid text metadata");
    let mut writer = encoder.write_header().expect("valid PNG header");
    writer.write_image_data(&pixels).expect("valid PNG pixels");
    writer.finish().expect("valid PNG trailer");

    for byte in output {
        print!("{byte:02x}");
    }
    println!();
}
