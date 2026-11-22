import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RichText } from "@/components/ui/RichText";
import { ABOUT_TEXTS, SHARED_TEXTS } from "@/content/site-texts";
import { getTexts } from "@/lib/site-text";
import { safeHttpsUrl } from "@/lib/safe-url";

const ABOUT_DEFAULTS = { ...ABOUT_TEXTS, ...SHARED_TEXTS };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTexts(ABOUT_DEFAULTS);
  return {
    title: t["about.meta.title"],
    description: t["about.meta.description"],
    alternates: { canonical: "/about" },
    openGraph: { title: t["about.meta.ogTitle"], url: "/about" },
  };
}

export default async function AboutPage() {
  const t = await getTexts(ABOUT_DEFAULTS);
  const values = ["gentle", "clear", "welcoming"] as const;
  const expect = ["before", "start", "during", "after"] as const;
  const instagramUrl = safeHttpsUrl(t["shared.teacher.instagramUrl"], SHARED_TEXTS["shared.teacher.instagramUrl"]);
  return (
    <>
      <section className="sec" aria-labelledby="about-h">
        <div className="wrap split">
          <div>
            <p className="eyebrow">{t["about.hero.eyebrow"]}</p>
            <h1 id="about-h">{t["about.hero.title"]}</h1>
            <p className="lead">{t["about.hero.lead"]}</p>
          </div>
          <div className="photo-rounded">
            <Image
              src="/real/about-hero-01.webp"
              alt={t["about.hero.imageAlt"]}
              width={1136}
              height={757}
              priority
              sizes="(min-width: 860px) 480px, 90vw"
            />
          </div>
        </div>
      </section>

      <section className="sec sand" aria-labelledby="story-h">
        <div className="wrap teacher">
          <div className="pic">
            <div className="arch-ph">
              <Image
                src="/real/teacher-home-01.webp"
                alt={t["shared.teacher.imageAlt"]}
                width={418}
                height={523}
                sizes="(min-width: 860px) 400px, 90vw"
              />
            </div>
          </div>
          <div>
            <p className="eyebrow">{t["shared.teacher.eyebrow"]}</p>
            <h2 id="story-h">{t["shared.teacher.title"]}</h2>
            <p>{t["shared.teacher.bio"]}</p>
            <p>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                {`Instagram: @${t["shared.teacher.instagramName"]}`}
              </a>
            </p>
            <p>
              <RichText text={t["about.teacher.healthNote"]} />
            </p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="values-h">
        <div className="wrap">
          <h2 id="values-h" style={{ marginBottom: 28 }}>
            {t["about.values.title"]}
          </h2>
          <div className="values">
            {values.map((v) => (
              <div className="value" key={v}>
                <h3>{t[`about.values.${v}.title`]}</h3>
                <p>{t[`about.values.${v}.text`]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sand" aria-labelledby="expect-h">
        <div className="wrap">
          <h2 id="expect-h" style={{ marginBottom: 28 }}>
            {t["about.expect.title"]}
          </h2>
          <ol className="expect">
            {expect.map((e) => (
              <li key={e}>
                <h3>{t[`about.expect.${e}.title`]}</h3>
                <p>{t[`about.expect.${e}.text`]}</p>
              </li>
            ))}
          </ol>
          <p className="hint" style={{ marginTop: 18 }}>
            <RichText text={t["about.expect.healthHint"]} />
          </p>
          <Link className="btn btn-primary" href="/schedule">
            {t["about.expect.cta"]}
          </Link>
        </div>
      </section>
    </>
  );
}
