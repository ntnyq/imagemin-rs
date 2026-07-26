import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const width = 64;
const height = 48;
const entryCount = 10;
const ifdOffset = 8;
const bitsOffset = ifdOffset + 2 + entryCount * 12 + 4;
const pixelOffset = bitsOffset + 6;
const pixelBytes = width * height * 3;
const output = Buffer.alloc(pixelOffset + pixelBytes);

output.write("II", 0, "ascii");
output.writeUInt16LE(42, 2);
output.writeUInt32LE(ifdOffset, 4);
output.writeUInt16LE(entryCount, ifdOffset);

let entryOffset = ifdOffset + 2;
writeEntry(256, 4, 1, width);
writeEntry(257, 4, 1, height);
writeEntry(258, 3, 3, bitsOffset);
writeEntry(259, 3, 1, 1);
writeEntry(262, 3, 1, 2);
writeEntry(273, 4, 1, pixelOffset);
writeEntry(277, 3, 1, 3);
writeEntry(278, 4, 1, height);
writeEntry(279, 4, 1, pixelBytes);
writeEntry(284, 3, 1, 1);
output.writeUInt32LE(0, entryOffset);

output.writeUInt16LE(8, bitsOffset);
output.writeUInt16LE(8, bitsOffset + 2);
output.writeUInt16LE(8, bitsOffset + 4);

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = pixelOffset + (y * width + x) * 3;
    output[offset] = (x * 7 + y * 3) & 255;
    output[offset + 1] = (x * 2 + y * 11) & 255;
    output[offset + 2] = ((x ^ y) * 13) & 255;
  }
}

const fixturesDirectory = fileURLToPath(new URL("../fixtures/webp", import.meta.url));
await mkdir(fixturesDirectory, { recursive: true });
await writeFile(
  new URL("../fixtures/webp/rgb-tiff.hex", import.meta.url),
  `${output
    .toString("hex")
    .match(/.{1,96}/g)
    .join("\n")}\n`,
);

function writeEntry(tag, type, count, value) {
  output.writeUInt16LE(tag, entryOffset);
  output.writeUInt16LE(type, entryOffset + 2);
  output.writeUInt32LE(count, entryOffset + 4);
  if (type === 3 && count === 1) output.writeUInt16LE(value, entryOffset + 8);
  else output.writeUInt32LE(value, entryOffset + 8);
  entryOffset += 12;
}
