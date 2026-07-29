export type ImageKind = "gif" | "png" | "svg";

export interface OptimizeRequest {
  bytes: ArrayBuffer;
  id: number;
  kind: ImageKind;
}

export interface OptimizeSuccess {
  bytes: ArrayBuffer;
  codec: string;
  id: number;
  inputBytes: number;
  ok: true;
  outputBytes: number;
}

export interface OptimizeFailure {
  code?: string;
  id: number;
  message: string;
  ok: false;
  plugin?: string;
}

export type OptimizeResponse = OptimizeFailure | OptimizeSuccess;
