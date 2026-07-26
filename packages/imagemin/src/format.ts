import type { ImageFormat } from "./types";

const textDecoder = new TextDecoder();

export function detectImageFormat(input: Uint8Array): ImageFormat {
  if (startsWith(input, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";

  if (startsWith(input, [0xff, 0xd8, 0xff])) return "jpeg";

  if (startsWithAscii(input, "GIF87a") || startsWithAscii(input, "GIF89a")) return "gif";

  if (startsWithAscii(input, "RIFF") && asciiAt(input, 8, "WEBP")) return "webp";

  if (asciiAt(input, 4, "ftyp") && (asciiAt(input, 8, "avif") || asciiAt(input, 8, "avis")))
    return "avif";

  const sample = textDecoder.decode(input.subarray(0, 4096)).trimStart();
  if (sample.startsWith("<svg") || (sample.startsWith("<?xml") && sample.includes("<svg")))
    return "svg";

  return "unknown";
}

function startsWith(input: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => input[index] === byte);
}

function startsWithAscii(input: Uint8Array, signature: string): boolean {
  return asciiAt(input, 0, signature);
}

function asciiAt(input: Uint8Array, offset: number, signature: string): boolean {
  if (input.length < offset + signature.length) return false;

  return [...signature].every(
    (character, index) => input[offset + index] === character.charCodeAt(0),
  );
}
