import cwebpBinary from "cwebp-bin";
import gifsicleBinary from "gifsicle";
import jpegtranBinary from "jpegtran-bin";
import mozjpegBinary from "mozjpeg";
import pngquantBinary from "pngquant-bin";

process.env["IMAGEMIN_RS_CWEBP_PATH"] ??= cwebpBinary;
process.env["IMAGEMIN_RS_GIFSICLE_PATH"] ??= gifsicleBinary;
process.env["IMAGEMIN_RS_CJPEG_PATH"] ??= mozjpegBinary;
process.env["IMAGEMIN_RS_JPEGTRAN_PATH"] ??= jpegtranBinary;
process.env["IMAGEMIN_RS_PNGQUANT_PATH"] ??= pngquantBinary;
