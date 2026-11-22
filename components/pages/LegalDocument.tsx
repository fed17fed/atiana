import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalBody } from "@/components/pages/LegalBody";
import { Icon } from "@/components/ui/Icon";
import { getLegalDoc } from "@/lib/legal-cached";
import type { LegalSlug } from "@/lib/legal";
import { footerColumns } from "@/lib/nav";

const legalLinks = footerColumns.find((c) => c.title === "Legal")?.links ?? [];

/** Metadata for one legal page (used by the 5 route files). */
export async function legalMetadata(slug: LegalSlug): Promise<Metadata> {
  const doc = await getLegalDoc(slug);
  if (!doc) return { title: "Page not found" };
  return {
    title: doc.title,
    description: `${doc.title} of KEA by Atiana.`,
    alternates: { canonical: `/legal/${doc.slug}` },
    openGraph: { title: `${doc.title} – KEA by Atiana`, url: `/legal/${doc.slug}` },
  };
}

/** Renders one legal page: the published version from the database, or content/legal/<slug>.mdx (task 12.13). Text checked by a lawyer (owner, 2026-11-19); a note is shown only while [OWNER] details are missing. */
export async function LegalDocument({ slug }: { slug: LegalSlug }) {
  const doc = await getLegalDoc(slug);
  if (!doc) notFound();
  const ownerDetailsMissing = /\[(OWNER|COMPANY|ADDRESS|CRO|CONTACT|DEV)/.test(doc.body);

  return (
    <article className="sec legal">
      <div className="prose-narrow">
        {(doc.draftNotice || ownerDetailsMissing) && (
          <div className="alert a-warn" role="note">
            <Icon name="warn" />
            <div>
              {doc.draftNotice && <b>{doc.draftNotice}</b>}
              {ownerDetailsMissing && <p>Some details in [BRACKETS] (company data) will be added before go-live.</p>}
            </div>
          </div>
        )}

        <LegalBody body={doc.body} />

        {doc.updated && <p className="hint">Version date: {doc.updated}</p>}

        <nav aria-label="Other legal pages" className="legal-nav" style={{ marginTop: 28 }}>
          <ul>
            {legalLinks
              .filter((l) => l.href !== `/legal/${doc.slug}`)
              .map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
          </ul>
        </nav>
      </div>
    </article>
  );
}
