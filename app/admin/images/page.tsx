import type { Metadata } from "next";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ImagePicker } from "@/components/admin/ImagePicker";
import { ImageUploadForm, Thumb } from "@/components/admin/ImageUploadForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { imageStorageMode, isSitePhotoUrl, NOT_ACTIVE_MESSAGE } from "@/lib/images/storage";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { deleteImageAction } from "./actions";

export const metadata: Metadata = { title: "Images" };

const DELETED: Record<string, string> = {
  ok: "Image deleted.",
  missing: "This image was already deleted.",
  "site-photo": "This is a site photo (it ships with the site). It cannot be deleted here.",
  "in-use": "This image is still used, so it was not deleted. First choose another image (or \"Use no image\") in:",
  failed: "Sorry, that did not work. Try again.",
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminImagesPage({ searchParams }: PageProps<"/admin/images">) {
  await requireAdmin("/admin/images");
  const sp = await searchParams;
  const delKey = first(sp.deleted) ?? "";
  const delText = Object.hasOwn(DELETED, delKey) ? DELETED[delKey] : undefined;
  const usedBy = delKey === "in-use" ? (first(sp.used) ?? "").slice(0, 300) : "";
  const mode = imageStorageMode();
  const images = await safeDb("admin images", async () => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.mediaImage.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, alt: true, width: true, height: true } });
  });
  if (!images) return <DbNotice what="the image library" />;
  return (
    <div className="grid gap-8">
      <PageHeader title="Images" crumbs={[{ label: "Images" }]} lead="Upload pictures for the site. Every picture is saved as WebP and needs an alt text. You can delete an uploaded picture when no event uses it. Site photos cannot be deleted." />
      {delText &&
        (delKey === "ok" || delKey === "missing" ? (
          <StatusMessage>{delText}</StatusMessage>
        ) : (
          <div className="alert a-error" role="alert">
            <p>
              {delText}
              {usedBy && <> <b>{usedBy}</b></>}
            </p>
          </div>
        ))}
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
                {isSitePhotoUrl(img.url) ? (
                  <span className="hint">Site photo (cannot be deleted)</span>
                ) : (
                  <ConfirmDialog
                    triggerLabel="Delete"
                    title="Delete this image?"
                    message={`"${img.alt}" will be removed from the library and from the image storage. This cannot be undone. If an event still uses it, nothing is deleted.`}
                    confirmLabel="Yes, delete"
                    action={deleteImageAction.bind(null, img.id)}
                  />
                )}
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
