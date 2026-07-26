import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  height: number;
  rgba: Uint8Array;
  width: number;
}

export function decodePng(input: Uint8Array): DecodedPng {
  const data = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    throw new TypeError("Expected PNG data");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array = new Uint8Array();
  let transparency: Uint8Array = new Uint8Array();
  const imageData: Buffer[] = [];
  let position = 8;

  while (position + 12 <= data.length) {
    const length = data.readUInt32BE(position);
    const end = position + 12 + length;
    if (end > data.length) throw new Error("Truncated PNG chunk");
    const type = data.subarray(position + 4, position + 8).toString();
    const chunk = data.subarray(position + 8, position + 8 + length);

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8] ?? 0;
      colorType = chunk[9] ?? 0;
      interlace = chunk[12] ?? 0;
    } else if (type === "PLTE") {
      palette = chunk;
    } else if (type === "tRNS") {
      transparency = chunk;
    } else if (type === "IDAT") {
      imageData.push(chunk);
    } else if (type === "IEND") {
      break;
    }
    position = end;
  }

  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 3 && colorType !== 6)) {
    throw new Error(
      `Unsupported PNG test format: depth=${bitDepth}, type=${colorType}, interlace=${interlace}`,
    );
  }

  const bytesPerPixel = colorType === 6 ? 4 : 1;
  const rowBytes = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  if (filtered.length !== height * (rowBytes + 1)) throw new Error("Unexpected PNG data size");

  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset] ?? 0;
    sourceOffset += 1;
    const rowOffset = y * rowBytes;
    const previousRowOffset = rowOffset - rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? (pixels[rowOffset + x - bytesPerPixel] ?? 0) : 0;
      const above = y > 0 ? (pixels[previousRowOffset + x] ?? 0) : 0;
      const upperLeft =
        y > 0 && x >= bytesPerPixel ? (pixels[previousRowOffset + x - bytesPerPixel] ?? 0) : 0;
      const predictor = filterPredictor(filter, left, above, upperLeft);
      pixels[rowOffset + x] = ((filtered[sourceOffset] ?? 0) + predictor) & 0xff;
      sourceOffset += 1;
    }
  }

  if (colorType === 6) return { height, rgba: pixels, width };

  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 1) {
    const paletteIndex = pixels[index] ?? 0;
    const paletteOffset = paletteIndex * 3;
    const outputOffset = index * 4;
    if (paletteOffset + 2 >= palette.length) throw new Error("PNG palette index is out of range");
    rgba[outputOffset] = palette[paletteOffset] ?? 0;
    rgba[outputOffset + 1] = palette[paletteOffset + 1] ?? 0;
    rgba[outputOffset + 2] = palette[paletteOffset + 2] ?? 0;
    rgba[outputOffset + 3] = transparency[paletteIndex] ?? 255;
  }

  return { height, rgba, width };
}

function filterPredictor(filter: number, left: number, above: number, upperLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return above;
    case 3:
      return Math.floor((left + above) / 2);
    case 4:
      return paeth(left, above, upperLeft);
    default:
      throw new Error(`Unsupported PNG row filter ${filter}`);
  }
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}
