import { ImageminError } from "./errors";

const MAX_JPEG_BYTES = 256 * 1024 * 1024;
const MAX_DECODED_BYTES = 512 * 1024 * 1024;

export interface JpegDimensions {
  height: number;
  width: number;
}

export function isJpeg(input: Uint8Array): boolean {
  return input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
}

export function validateJpegResourceLimits(
  input: Uint8Array,
  plugin: "jpegtran" | "mozjpeg",
): JpegDimensions | undefined {
  if (input.byteLength > MAX_JPEG_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `JPEG input exceeds the ${MAX_JPEG_BYTES} byte limit`,
      { plugin },
    );
  }

  const dimensions = readJpegDimensions(input);
  if (dimensions && dimensions.width * dimensions.height * 4 > MAX_DECODED_BYTES) {
    throw new ImageminError(
      "ERR_IMAGEMIN_INVALID_INPUT",
      `JPEG dimensions exceed the ${MAX_DECODED_BYTES} byte decode limit`,
      { plugin },
    );
  }

  return dimensions;
}

function readJpegDimensions(input: Uint8Array): JpegDimensions | undefined {
  let position = 2;

  while (position + 3 < input.byteLength) {
    while (input[position] === 0xff) position += 1;
    const marker = input[position] ?? 0;
    position += 1;

    if (marker === 0xd9 || marker === 0xda) return undefined;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (position + 2 > input.byteLength) return undefined;

    const length = ((input[position] ?? 0) << 8) | (input[position + 1] ?? 0);
    if (length < 2 || position + length > input.byteLength) return undefined;
    if (isStartOfFrame(marker) && length >= 7) {
      return {
        height: ((input[position + 3] ?? 0) << 8) | (input[position + 4] ?? 0),
        width: ((input[position + 5] ?? 0) << 8) | (input[position + 6] ?? 0),
      };
    }
    position += length;
  }

  return undefined;
}

function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}
