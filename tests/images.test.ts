import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toWebp } from "@/lib/images/convert";
import { MAX_UPLOAD_BYTES, checkUpload, detectImageType, tooBigMessage, WRONG_TYPE_MESSAGE } from "@/lib/images/rules";
import { imageStorageMode, LOCAL_NAME_RE, newImageName, NOT_ACTIVE_MESSAGE, readLocalImage, saveWebp } from "@/lib/images/storage";

const blobPut = vi.hoisted(() => vi.fn());
vi.mock("@vercel/blob", () => ({ put: blobPut }));
import { uploadImage } from "@/lib/images/service";

async function png(w = 40, h = 20) {
  return sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).png().toBuffer();
}
const fakeDb = () => ({ mediaImage: { create: vi.fn().mockResolvedValue({ id: "m1", url: "/uploads/x.webp", alt: "a", width: 40, height: 20 }) }, adminAuditLog: { create: vi.fn().mockResolvedValue({}) } });
const tmpEnv = () => ({ LOCAL_UPLOAD_DIR: mkdtempSync(join(tmpdir(), "atiana-up-")) });

describe("upload rules", () => {
  it("reads the real type from the first bytes", async () => {
    expect(detectImageType(await png())).toBe("png");
    expect(detectImageType(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageType(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).webp().toBuffer())).toBe("webp");
    expect(detectImageType(Buffer.from("GIF89a....."))).toBeNull();
    expect(detectImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(detectImageType(Buffer.from("%PDF-1.4"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
  it("5 MB is allowed, 5 MB + 1 byte is refused with a clear message", async () => {
    const head = await png();
    expect(checkUpload({ size: MAX_UPLOAD_BYTES, head }, "alt").ok).toBe(true);
    const r = checkUpload({ size: MAX_UPLOAD_BYTES + 1, head }, "alt");
    expect(r).toEqual({ ok: false, fieldErrors: { file: [tooBigMessage(MAX_UPLOAD_BYTES + 1)] } });
    expect(tooBigMessage(7.2 * 1024 * 1024)).toBe("This file is 7.2 MB. The limit is 5 MB.");
  });
  it("wrong type, empty file, missing file", () => {
    expect(checkUpload({ size: 10, head: Buffer.from("GIF89a") }, "alt")).toEqual({ ok: false, fieldErrors: { file: [WRONG_TYPE_MESSAGE] } });
    expect(checkUpload({ size: 0, head: new Uint8Array() }, "alt").ok).toBe(false);
    expect(checkUpload(null, "alt").ok).toBe(false);
  });
  it("alt text is required (null, empty, spaces) and max 200", async () => {
    const head = await png();
    for (const bad of [null, undefined, "", "   ", 5, "x".repeat(201)]) {
      const r = checkUpload({ size: 100, head }, bad);
      expect(r.ok, String(bad)).toBe(false);
      if (!r.ok) expect(r.fieldErrors.alt).toBeTruthy();
    }
    const good = checkUpload({ size: 100, head }, "  Atiana   teaching ");
    expect(good.ok && good.alt).toBe("Atiana teaching");
  });
  it("all problems are listed together", () => {
    const r = checkUpload({ size: 10, head: Buffer.from("GIF89a") }, "");
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["alt", "file"]);
  });
});

describe("WebP conversion", () => {
  it("png -> webp, small picture is not enlarged", async () => {
    const out = await toWebp(await png(40, 20));
    expect(detectImageType(out.bytes)).toBe("webp");
    expect([out.width, out.height]).toEqual([40, 20]);
  });
  it("big picture is shrunk to 2000 px on the long side", async () => {
    const out = await toWebp(await png(3000, 1500));
    expect([out.width, out.height]).toEqual([2000, 1000]);
  });
  it("metadata (EXIF, GPS) is dropped", async () => {
    const withExif = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#33c" } }).jpeg().withExif({ IFD0: { Copyright: "SECRET-OWNER" } }).toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();
    const out = await toWebp(withExif);
    expect((await sharp(out.bytes).metadata()).exif).toBeUndefined();
    expect(out.bytes.toString("latin1")).not.toContain("SECRET-OWNER");
  });
  it("a broken file with a right header throws", async () => {
    await expect(toWebp(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not really a png")]))).rejects.toThrow();
  });
});

describe("storage mode", () => {
  it("token -> blob (also on Vercel)", () => {
    expect(imageStorageMode({ BLOB_READ_WRITE_TOKEN: "t" })).toBe("blob");
    expect(imageStorageMode({ BLOB_READ_WRITE_TOKEN: "t", VERCEL: "1" })).toBe("blob");
    expect(imageStorageMode({ BLOB_STORE_ID: "store_x", VERCEL: "1" })).toBe("blob");
    expect(imageStorageMode({ BLOB_STORE_ID: "store_x" })).toBe("local");
    expect(imageStorageMode({ BLOB_STORE_ID: " ", VERCEL: "1" })).toBe("off");
  });
  it("no token on a developer machine -> local folder", () => {
    expect(imageStorageMode({})).toBe("local");
    expect(imageStorageMode({ BLOB_READ_WRITE_TOKEN: "  " })).toBe("local");
  });
  it("no token on Vercel -> off", () => {
    expect(imageStorageMode({ VERCEL: "1" })).toBe("off");
    expect(imageStorageMode({ VERCEL_ENV: "production" })).toBe("off");
  });
  it("generated names are safe and unique", () => {
    const a = newImageName();
    expect(a).toMatch(LOCAL_NAME_RE);
    expect(newImageName()).not.toBe(a);
  });
});

describe("saving", () => {
  beforeEach(() => blobPut.mockReset());
  it("local: writes one file in the folder and the route can read it back; bad names are refused", async () => {
    const env = tmpEnv();
    const saved = await saveWebp(Buffer.from("webp-bytes"), "local", env);
    expect(saved.storage).toBe("local");
    const name = saved.url.replace("/uploads/", "");
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toEqual([name]);
    expect(readFileSync(join(env.LOCAL_UPLOAD_DIR, name)).toString()).toBe("webp-bytes");
    expect((await readLocalImage(name, env))?.toString()).toBe("webp-bytes");
    for (const bad of ["../../etc/passwd", "..%2f..%2fx.webp", "a.webp", `${name}/../x`, "20261121-zzzzzzzzzzzz.webp", ""]) expect(await readLocalImage(bad, env), bad).toBeNull();
  });
  it("blob: calls the real put() with the token, public WebP, no overwrite", async () => {
    blobPut.mockResolvedValue({ url: "https://abc.public.blob.vercel-storage.com/uploads/x.webp" });
    const saved = await saveWebp(Buffer.from("w"), "blob", { BLOB_READ_WRITE_TOKEN: "tok" });
    expect(saved).toEqual({ url: "https://abc.public.blob.vercel-storage.com/uploads/x.webp", storage: "blob" });
    const [path, , opts] = blobPut.mock.calls[0];
    expect(path).toMatch(/^uploads\/[0-9]{8}-[0-9a-f]{12}\.webp$/);
    expect(opts).toMatchObject({ access: "public", contentType: "image/webp", allowOverwrite: false, token: "tok" });
  });
  it("blob (OIDC store): calls put() without a token, so @vercel/blob uses BLOB_STORE_ID + OIDC", async () => {
    blobPut.mockClear();
    blobPut.mockResolvedValue({ url: "https://abc.public.blob.vercel-storage.com/uploads/y.webp" });
    await saveWebp(Buffer.from("w"), "blob", { BLOB_STORE_ID: "store_x", VERCEL: "1" });
    const [, , opts] = blobPut.mock.calls[0];
    expect(opts).toMatchObject({ access: "public", contentType: "image/webp", allowOverwrite: false });
    expect(opts).not.toHaveProperty("token");
  });
  it("off: refuses to save", async () => {
    await expect(saveWebp(Buffer.from("w"), "off", {})).rejects.toThrow();
  });
});

describe("uploadImage service", () => {
  beforeEach(() => blobPut.mockReset());
  it("on Vercel without a token: honest message, nothing written, nothing converted, no DB row", async () => {
    const db = fakeDb();
    const dir = mkdtempSync(join(tmpdir(), "atiana-off-"));
    const r = await uploadImage(db as never, { size: 10, bytes: await png() }, "alt", "admin", { VERCEL: "1", LOCAL_UPLOAD_DIR: dir });
    expect(r).toEqual({ ok: false, message: NOT_ACTIVE_MESSAGE });
    expect(readdirSync(dir)).toEqual([]);
    expect(blobPut).not.toHaveBeenCalled();
    expect(db.mediaImage.create).not.toHaveBeenCalled();
  });
  it("local: saves WebP, library row with alt, audit row without alt text or file name", async () => {
    const db = fakeDb();
    const env = tmpEnv();
    const bytes = await png(100, 50);
    const r = await uploadImage(db as never, { size: bytes.length, bytes }, " Moon  pose ", "admin-1", env);
    expect(r.ok).toBe(true);
    const files = readdirSync(env.LOCAL_UPLOAD_DIR);
    expect(files).toHaveLength(1);
    expect(detectImageType(readFileSync(join(env.LOCAL_UPLOAD_DIR, files[0])))).toBe("webp");
    expect(db.mediaImage.create.mock.calls[0][0].data).toMatchObject({ alt: "Moon pose", storage: "local", width: 100, height: 50, createdById: "admin-1" });
    const audit = db.adminAuditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ userId: "admin-1", action: "image.upload", entity: "MediaImage" });
    expect(audit.summary).not.toMatch(/Moon/);
  });
  it("too big / wrong type / no alt: refused before anything is saved", async () => {
    const db = fakeDb();
    const env = tmpEnv();
    const bytes = await png();
    expect((await uploadImage(db as never, { size: MAX_UPLOAD_BYTES + 1, bytes }, "a", "x", env)).ok).toBe(false);
    expect((await uploadImage(db as never, { size: 5, bytes: Buffer.from("GIF89a....") }, "a", "x", env)).ok).toBe(false);
    expect((await uploadImage(db as never, { size: bytes.length, bytes }, "", "x", env)).ok).toBe(false);
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toEqual([]);
    expect(db.mediaImage.create).not.toHaveBeenCalled();
  });
  it("a broken picture gives a field error, not a crash", async () => {
    const db = fakeDb();
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("garbage")]);
    const r = await uploadImage(db as never, { size: broken.length, bytes: broken }, "a", "x", tmpEnv());
    expect(r.ok).toBe(false);
  });
  it("blob mode with a token goes to Blob and stores the Blob URL", async () => {
    blobPut.mockResolvedValue({ url: "https://abc.public.blob.vercel-storage.com/uploads/n.webp" });
    const db = fakeDb();
    const bytes = await png();
    const r = await uploadImage(db as never, { size: bytes.length, bytes }, "alt", "a", { BLOB_READ_WRITE_TOKEN: "tok", VERCEL: "1" });
    expect(r.ok).toBe(true);
    expect(db.mediaImage.create.mock.calls[0][0].data).toMatchObject({ storage: "blob", url: "https://abc.public.blob.vercel-storage.com/uploads/n.webp" });
  });
});
