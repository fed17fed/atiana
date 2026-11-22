import sharp from "sharp";
import { MAX_IMAGE_SIDE, MAX_INPUT_PIXELS } from "./rules";

export type WebpResult = { bytes: Buffer; width: number; height: number };

/**
 * Any jpg / png / webp -> WebP, at most 2000 px, never enlarged. Turns the picture upright (EXIF) and drops all metadata (GPS, camera).
 * Throws when the file is not a real image (broken file) or has too many pixels.
 */
export async function toWebp(input: Buffer): Promise<WebpResult> {
  const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}
