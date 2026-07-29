import cwebpBinary from "cwebp-bin";

process.env["IMAGEMIN_RS_CWEBP_PATH"] ??= cwebpBinary;
