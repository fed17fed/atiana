import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    title: `${doc.title} (draft)`,
    description: `${doc.title} of KEA by Atiana. Draft text, to be checked by a lawyer before go-live.`,
    alternates: { canonical: `/legal/${doc.slug}` },
    openGraph: { title: `${doc.title} – KEA by Atiana`, url: `/legal/${doc.slug}` },
  };
}

/** Renders one legal page from content/legal/<slug>.mdx with the DRAFT banner. */
export async function LegalDocument({ slug }: { slug: LegalSlug }) {
  const doc = await getLegalDoc(slug);
  if (!doc) notFound();

  return (
    <article className="sec legal">
      <div className="prose-narrow">
        <div className="alert a-warn" role="note">
          <Icon name="warn" />
          <div>
            <b>{doc.draftNotice}</b>
            <p>
              This text is a draft for the demo site. Parts in [OWNER: ...] or [LAWYER: ...] are
              still open.
            </p>
          </div>
        </div>

        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ children }) => (
              <div className="table-wrap" tabIndex={0}>
                <table>{children}</table>
              </div>
            ),
          }}
        >
          {doc.body}
        </Markdown>

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
