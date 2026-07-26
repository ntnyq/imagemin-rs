import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const packageRequire = createRequire(new URL("../packages/imagemin/package.json", import.meta.url));
const mozjpeg = (await import(pathToFileURL(packageRequire.resolve("mozjpeg")).href)).default;

const WIDTH = 96;
const HEIGHT = 64;
const header = Buffer.from(`P6\n${WIDTH} ${HEIGHT}\n255\n`);
const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);

for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const offset = (y * WIDTH + x) * 3;
    pixels[offset] = (x * 19 + y * 7 + x * y) % 256;
    pixels[offset + 1] = (x * 5 + y * 23 + (x ^ y) * 3) % 256;
    pixels[offset + 2] = (x * 11 + y * 13 + x * y * 3) % 256;
  }
}

const encoded = spawnSync(mozjpeg, ["-baseline", "-quality", "94", "-sample", "2x2"], {
  input: Buffer.concat([header, pixels]),
  maxBuffer: 8 * 1024 * 1024,
});
if (encoded.status !== 0) {
  throw new Error(`cjpeg fixture generation failed: ${encoded.stderr.toString().trim()}`);
}

const exif = Buffer.from([
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
  0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);
const icc = Buffer.concat([
  Buffer.from("ICC_PROFILE\0", "ascii"),
  Buffer.from([1, 1]),
  Buffer.alloc(128, 0x5a),
]);
const comment = Buffer.from("imagemin-rs JPEG fixture", "utf8");
const metadata = Buffer.concat([
  jpegSegment(0xe1, exif),
  jpegSegment(0xe2, icc),
  jpegSegment(0xfe, comment),
]);
const fixture = Buffer.concat([
  encoded.stdout.subarray(0, 2),
  metadata,
  encoded.stdout.subarray(2),
]);
const fixtureUrl = new URL("../fixtures/jpeg/color-metadata.hex", import.meta.url);

await writeFile(fixtureUrl, `${fixture.toString("hex")}\n`);

const grayscalePixels = Buffer.alloc(WIDTH * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    grayscalePixels[y * WIDTH + x] = (x * 17 + y * 29 + x * y * 3) % 256;
  }
}
const grayscale = spawnSync(mozjpeg, ["-baseline", "-quality", "94"], {
  input: Buffer.concat([Buffer.from(`P5\n${WIDTH} ${HEIGHT}\n255\n`), grayscalePixels]),
  maxBuffer: 8 * 1024 * 1024,
});
if (grayscale.status !== 0) {
  throw new Error(`grayscale fixture generation failed: ${grayscale.stderr.toString().trim()}`);
}
await writeFile(
  new URL("../fixtures/jpeg/grayscale.hex", import.meta.url),
  `${grayscale.stdout.toString("hex")}\n`,
);

function jpegSegment(marker, payload) {
  const segment = Buffer.alloc(payload.length + 4);
  segment[0] = 0xff;
  segment[1] = marker;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  return segment;
}
