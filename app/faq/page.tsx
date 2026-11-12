import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { visibleFaqGroups } from "@/content/faq";
import { packsEnabled, referralEnabled } from "@/lib/features";
import { faqJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about classes, Zoom, credits, booking and cancellation and 1:1 sessions.",
  alternates: { canonical: "/faq" },
  openGraph: { title: "Questions people ask – KEA by Atiana", url: "/faq" },
};

export default function FaqPage() {
  const faqGroups = visibleFaqGroups(packsEnabled(), referralEnabled());
  return (
    <section className="sec" aria-labelledby="faq-h">
      <JsonLd data={faqJsonLd(faqGroups)} />
      <div className="prose-narrow">
        <p className="eyebrow">FAQ</p>
        <h1 id="faq-h">Questions people ask</h1>
        <p className="lead">
          Short answers about classes, credits and booking. Cannot find yours? Please{" "}
          <Link href="/contact">write to us</Link>.
        </p>

        <nav aria-label="FAQ topics" className="legal-nav" style={{ margin: "20px 0 36px" }}>
          <ul>
            {faqGroups.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`}>{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        {faqGroups.map((g) => (
          <div className="faq-group" key={g.id}>
            <h2 id={g.id} style={{ fontSize: "1.6rem" }}>
              {g.title}
            </h2>
            <div className="accs">
              {g.items.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <div className="acc-body">
                    <p>{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
