use png::{BitDepth, ColorType, Encoder};

fn main() {
    let mut output = Vec::new();
    let mut encoder = Encoder::new(&mut output, 8, 8);
    encoder.set_color(ColorType::Rgba);
    encoder.set_depth(BitDepth::Eight);
    encoder.set_animated(2, 3).expect("valid animation control");
    encoder.set_frame_delay(1, 10).expect("valid first delay");
    let mut writer = encoder.write_header().expect("valid PNG header");
    writer
        .write_image_data(&[255; 8 * 8 * 4])
        .expect("valid first frame");
    writer.set_frame_delay(2, 10).expect("valid second delay");
    writer
        .write_image_data(&[0; 8 * 8 * 4])
        .expect("valid second frame");
    writer.finish().expect("valid PNG trailer");

    for byte in output {
        print!("{byte:02x}");
    }
    println!();
}
