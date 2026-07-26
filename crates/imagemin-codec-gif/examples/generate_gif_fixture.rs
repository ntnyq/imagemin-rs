use gif::{AnyExtension, DisposalMethod, Encoder, Frame, Repeat};

fn main() {
    const WIDTH: u16 = 32;
    const HEIGHT: u16 = 24;
    let palette = [0, 0, 0, 255, 40, 40, 40, 220, 80];
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, WIDTH, HEIGHT, &palette).expect("valid encoder");
    encoder
        .set_repeat(Repeat::Finite(3))
        .expect("valid repeat extension");
    encoder
        .write_raw_extension(AnyExtension(0xFE), &[b"imagemin-rs GIF fixture"])
        .expect("valid comment extension");

    for index in 0..8_u16 {
        let mut pixels = vec![0; usize::from(WIDTH) * usize::from(HEIGHT)];
        let left = usize::from(index * 3);
        for y in 8..16 {
            for x in left..left + 6 {
                pixels[y * usize::from(WIDTH) + x] = if index % 2 == 0 { 1 } else { 2 };
            }
        }
        let mut frame = Frame::from_indexed_pixels(WIDTH, HEIGHT, pixels, None);
        frame.delay = index + 1;
        frame.dispose = DisposalMethod::Keep;
        encoder.write_frame(&frame).expect("valid frame");
    }

    drop(encoder);
    for byte in output {
        print!("{byte:02x}");
    }
    println!();
}
