declare module "gifsicle" {
  const binaryPath: string;

  export default binaryPath;
}

declare module "pngquant-bin" {
  const binaryPath: string;

  export default binaryPath;
}

declare module "jpegtran-bin" {
  const binaryPath: string;

  export default binaryPath;
}

declare module "mozjpeg" {
  const binaryPath: string;

  export default binaryPath;
}

declare module "cwebp-bin" {
  const binaryPath: string;

  export default binaryPath;
}

declare module "imagemin-mozjpeg" {
  const factory: (options?: import("./types").MozjpegOptions) => (input: Buffer) => Promise<Buffer>;

  export default factory;
}

declare module "imagemin-jpegtran" {
  const factory: (
    options?: import("./types").JpegtranOptions,
  ) => (input: Uint8Array) => Promise<Uint8Array>;

  export default factory;
}

declare module "imagemin-webp" {
  const factory: (
    options?: import("./types").WebpOptions,
  ) => (input: Uint8Array) => Promise<Buffer>;

  export default factory;
}

declare module "imagemin-avif" {
  const factory: (options?: {
    chromaSubsampling?: "4:2:0" | "4:4:4";
    lossless?: boolean;
    quality?: number;
    speed?: number;
  }) => (input: Buffer) => Promise<Buffer>;

  export default factory;
}

declare module "imagemin" {
  interface UpstreamResult {
    data: Uint8Array;
    destinationPath?: string;
    sourcePath: string;
  }

  interface UpstreamOptions {
    destination?: string;
    glob?: boolean;
    plugins?: readonly import("./types").ImageminPlugin[];
  }

  interface UpstreamImagemin {
    (inputs: readonly string[], options?: UpstreamOptions): Promise<UpstreamResult[]>;
    buffer(input: Uint8Array, options?: Pick<UpstreamOptions, "plugins">): Promise<Uint8Array>;
  }

  const imagemin: UpstreamImagemin;
  export default imagemin;
}
