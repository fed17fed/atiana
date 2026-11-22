import type { Metadata } from "next";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { ImageUploadForm, Thumb } from "@/components/admin/ImageUploadForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { imageStorageMode, NOT_ACTIVE_MESSAGE } from "@/lib/images/storage";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Images" };

export default async function AdminImagesPage() {
  await requireAdmin("/admin/images");
  const mode = imageStorageMode();
  const images = await safeDb("admin images", async () => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.mediaImage.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, alt: true, width: true, height: true } });
  });
  if (!images) return <DbNotice what="the image library" />;
  return (
    <div className="grid gap-8">
      <PageHeader title="Images" crumbs={[{ label: "Images" }]} lead="Upload pictures for the site. Every picture is saved as WebP and needs an alt text. Old pictures stay in the library." />
      {mode === "off" ? (
        <div className="alert a-warn" role="status">
          <Icon name="info" />
          <div>
            <b>Not active yet</b>
            <p>{NOT_ACTIVE_MESSAGE}</p>
          </div>
        </div>
      ) : (
        <>
          {mode === "local" && (
            <p className="hint">Local mode: pictures are saved in the folder .local-uploads on this computer, not on the live site.</p>
          )}
          <section aria-labelledby="up-h">
            <h2 id="up-h" className="!text-2xl">Upload new image</h2>
            <ImageUploadForm active />
          </section>
        </>
      )}
      <section aria-labelledby="lib-h">
        <h2 id="lib-h" className="!text-2xl">Library ({images.length})</h2>
        {images.length === 0 ? (
          <EmptyState title="No images yet.">Use the upload form above.</EmptyState>
        ) : (
          <ul className="adm-thumbs">
            {images.map((img) => (
              <li key={img.id} className="adm-thumb">
                <Thumb image={img} />
                <span>{img.alt}</span>
                <span className="hint">{img.width} × {img.height}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="pick-h">
        <h2 id="pick-h" className="!text-2xl">Try the image picker</h2>
        <p className="hint">This is the same picker as in the event form. Only the event form has an image field today; classes have no image field. Nothing is saved here.</p>
        <ImagePicker name="demoImage" library={images.map(({ id, url, alt }) => ({ id, url, alt }))} uploadActive={mode !== "off"} />
      </section>
    </div>
  );
}
