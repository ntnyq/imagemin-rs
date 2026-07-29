import cwebpBinary from "cwebp-bin";
import jpegtranBinary from "jpegtran-bin";
import mozjpegBinary from "mozjpeg";

process.env["IMAGEMIN_RS_CWEBP_PATH"] ??= cwebpBinary;
process.env["IMAGEMIN_RS_CJPEG_PATH"] ??= mozjpegBinary;
process.env["IMAGEMIN_RS_JPEGTRAN_PATH"] ??= jpegtranBinary;
