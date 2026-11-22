/**
 * Browser side of the upload (used by ImageUploadForm). Not a security check: the server checks everything again.
 * Why it exists: Vercel accepts at most about 4.5 MB per request, but the owner's limit is 5 MB per file.
 * A big photo is therefore shrunk to WebP in the browser first (max 2000 px). The server still converts it again and drops metadata.
 */
import { MAX_IMAGE_SIDE, MAX_UPLOAD_BYTES, WRONG_TYPE_MESSAGE, tooBigMessage } from "./rules";

const SHRINK_ABOVE_BYTES = 3 * 1024 * 1024; // smaller files go to the server untouched
const SEND_LIMIT_BYTES = 4 * 1024 * 1024; // a file we could not shrink must still fit the request limit
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type Prepared = { ok: true; file: File } | { ok: false; message: string };

export async function prepareForUpload(file: File): Promise<Prepared> {
  if (!OK_TYPES.includes(file.type)) return { ok: false, message: WRONG_TYPE_MESSAGE };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: tooBigMessage(file.size) };
  if (file.size <= SHRINK_ABOVE_BYTES) return { ok: true, file };
  try {
    const bitmap = await createImageBitmap(file); // applies the EXIF rotation
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
    if (blob && blob.type === "image/webp" && blob.size < file.size) return { ok: true, file: new File([blob], "upload.webp", { type: "image/webp" }) };
  } catch {
    /* fall through: send the original if it is small enough */
  }
  if (file.size <= SEND_LIMIT_BYTES) return { ok: true, file };
  return { ok: false, message: "This picture could not be prepared in your browser. Try a smaller file." };
}
