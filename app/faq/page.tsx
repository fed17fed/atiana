import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { RichText } from "@/components/ui/RichText";
import { buildFaqGroups, FAQ_TEXT_KEYS, visibleFaqGroups } from "@/content/faq";
import { FAQ_TEXTS, SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import { packsEnabled, referralEnabled } from "@/lib/features";
import { splitParagraphs } from "@/lib/inline-text";
import { faqJsonLd } from "@/lib/jsonld";
import { getTexts } from "@/lib/site-text";

/** Every FAQ text key with its code default (page texts + group titles + questions + answers). */
const FAQ_DEFAULTS = Object.fromEntries(
  [...Object.keys(FAQ_TEXTS), ...FAQ_TEXT_KEYS].map((k) => [k, SITE_TEXT_DEFAULTS[k] ?? ""]),
);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTexts(FAQ_DEFAULTS);
  return {
    title: t["faq.meta.title"],
    description: t["faq.meta.description"],
    alternates: { canonical: "/faq" },
    openGraph: { title: t["faq.meta.ogTitle"], url: "/faq" },
  };
}

export default async function FaqPage() {
  const t = await getTexts(FAQ_DEFAULTS);
  const faqGroups = visibleFaqGroups(packsEnabled(), referralEnabled(), buildFaqGroups((key) => t[key]));
  return (
    <section className="sec" aria-labelledby="faq-h">
      <JsonLd data={faqJsonLd(faqGroups)} />
      <div className="prose-narrow">
        <p className="eyebrow">{t["faq.page.eyebrow"]}</p>
        <h1 id="faq-h">{t["faq.page.title"]}</h1>
        <p className="lead">
          <RichText text={t["faq.page.lead"]} />
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
                    {splitParagraphs(item.a).map((para, i) => (
                      <p key={i}>
                        <RichText text={para} />
                      </p>
                    ))}
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
