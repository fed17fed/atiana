import { imageStorageMode, readLocalImage } from "@/lib/images/storage";

/**
 * Serves images from the LOCAL upload folder (development only, task 12.12). On live the images are on Vercel Blob,
 * so this route answers 404 there. The file name is checked against a strict pattern (no path tricks).
 */
export async function GET(_req: Request, ctx: RouteContext<"/uploads/[file]">) {
  const { file } = await ctx.params;
  if (imageStorageMode() !== "local") return new Response("Not found", { status: 404 });
  const bytes = await readLocalImage(file);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
