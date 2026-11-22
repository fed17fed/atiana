/**
 * Image upload rules (task 12.12). Pure: no database, no sharp, no Next.js. The form and the server action use the same numbers.
 * The real file type is read from the first bytes of the file. The type or the name the browser sends is NOT trusted.
 */
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // owner decision: max 5 MB per upload
export const MAX_UPLOAD_MB_LABEL = "5 MB";
export const MAX_ALT_LENGTH = 200;
export const MAX_IMAGE_SIDE = 2000; // saved WebP is at most 2000 px on the long side (never enlarged)
export const MAX_INPUT_PIXELS = 40_000_000; // protects the server from "decompression bomb" images

export type DetectedType = "jpeg" | "png" | "webp";

export function detectImageType(bytes: Uint8Array): DetectedType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  // RIFF....WEBP
  if (bytes.length >= 12 && [0x52, 0x49, 0x46, 0x46].every((b, i) => bytes[i] === b) && [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b)) return "webp";
  return null;
}

export const WRONG_TYPE_MESSAGE = "Use a jpg, png or webp file.";

export function tooBigMessage(bytes: number): string {
  return `This file is ${(bytes / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB_LABEL}.`;
}

// Alt text: required, plain text. Empty input arrives as null from some forms, so null means "".
export const altSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""),
  z.string().min(1, "Alt text is required. Describe the photo for people who cannot see it.").max(MAX_ALT_LENGTH, `At most ${MAX_ALT_LENGTH} characters.`),
);

export type UploadCheck = { ok: true; type: DetectedType; alt: string } | { ok: false; fieldErrors: Record<string, string[]> };

/** Checks size, real type and alt text. Collects every problem, so the form can show them all at once. */
export function checkUpload(file: { size: number; head: Uint8Array } | null, altRaw: unknown): UploadCheck {
  const fieldErrors: Record<string, string[]> = {};
  let type: DetectedType | null = null;
  if (!file || file.size === 0) fieldErrors.file = ["Choose a file."];
  else if (file.size > MAX_UPLOAD_BYTES) fieldErrors.file = [tooBigMessage(file.size)];
  else {
    type = detectImageType(file.head);
    if (!type) fieldErrors.file = [WRONG_TYPE_MESSAGE];
  }
  const alt = altSchema.safeParse(altRaw);
  if (!alt.success) fieldErrors.alt = [alt.error.issues[0].message];
  if (Object.keys(fieldErrors).length > 0 || !type || !alt.success) return { ok: false, fieldErrors };
  return { ok: true, type, alt: alt.data };
}
