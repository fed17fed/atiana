/**
 * Where uploaded images are saved (task 12.12). One check decides, like the other integrations (isXEnabled):
 *   BLOB_READ_WRITE_TOKEN set        -> "blob"  (real Vercel Blob store, old token auth)
 *   BLOB_STORE_ID set + on Vercel    -> "blob"  (real Vercel Blob store, OIDC auth: new stores give only the store id; used on live)
 *   no token, NOT on Vercel          -> "local" (git-ignored folder .local-uploads/, only for development)
 *   no token, running on Vercel      -> "off"   (honest message "not active yet"; the Vercel file system is NEVER written)
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type StorageMode = "blob" | "local" | "off";
type Env = Record<string, string | undefined>;

export function imageStorageMode(env: Env = process.env): StorageMode {
  if (env.BLOB_READ_WRITE_TOKEN && env.BLOB_READ_WRITE_TOKEN.trim() !== "") return "blob";
  const onVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (onVercel && env.BLOB_STORE_ID && env.BLOB_STORE_ID.trim() !== "") return "blob"; // OIDC: @vercel/blob reads BLOB_STORE_ID + the Vercel OIDC token itself
  if (onVercel) return "off";
  return "local";
}

export const NOT_ACTIVE_MESSAGE = "Image upload is not active yet. The image storage (Vercel Blob) is not connected to this site.";

/** Folder for local uploads. Git-ignored (.gitignore: /.local-uploads/). */
export function localUploadDir(env: Env = process.env): string {
  return env.LOCAL_UPLOAD_DIR && env.LOCAL_UPLOAD_DIR.trim() !== "" ? env.LOCAL_UPLOAD_DIR : join(process.cwd(), ".local-uploads");
}

/** File names we create ourselves: "<yyyymmdd>-<12 random hex>.webp". Never a name from the visitor. */
export function newImageName(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(6).toString("hex")}.webp`;
}

export const LOCAL_NAME_RE = /^[0-9]{8}-[0-9a-f]{12}\.webp$/;

export type SavedFile = { url: string; storage: "blob" | "local" };

/** Saves a WebP file. Throws when the mode is "off" (the caller must check first). */
export async function saveWebp(bytes: Buffer, mode: StorageMode, env: Env = process.env): Promise<SavedFile> {
  const name = newImageName();
  if (mode === "blob") {
    const { put } = await import("@vercel/blob"); // loaded only when the token exists
    const blob = await put(`uploads/${name}`, bytes, { access: "public", contentType: "image/webp", addRandomSuffix: false, allowOverwrite: false, ...(env.BLOB_READ_WRITE_TOKEN?.trim() ? { token: env.BLOB_READ_WRITE_TOKEN } : {}) });
    return { url: blob.url, storage: "blob" };
  }
  if (mode === "local") {
    const dir = localUploadDir(env);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes, { flag: "wx" }); // "wx": never overwrite an existing file
    return { url: `/uploads/${name}`, storage: "local" };
  }
  throw new Error("Image storage is off");
}

/** Reads a local file for the /uploads route. Returns null for a bad name or a missing file. */
export async function readLocalImage(name: string, env: Env = process.env): Promise<Buffer | null> {
  if (!LOCAL_NAME_RE.test(name)) return null;
  try {
    return await readFile(join(localUploadDir(env), name));
  } catch {
    return null;
  }
}
