import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HomeNewsletterBand } from "@/components/pages/HomeNewsletterBand";
import { HomeTestimonials } from "@/components/pages/HomeTestimonials";
import { Icon } from "@/components/ui/Icon";
import { JsonLd } from "@/components/seo/JsonLd";
import { RichText } from "@/components/ui/RichText";
import { nextClasses, spotsLabel } from "@/content/home";
import { classTypes, oneToOneOfferings } from "@/content/catalog";
import { HOME_TEXTS, SHARED_TEXTS } from "@/content/site-texts";
import { priceText } from "@/lib/booking-rules";
import { organizationJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { safeHttpsUrl } from "@/lib/safe-url";
import { getSiteUrl } from "@/lib/site";
import { getTexts } from "@/lib/site-text";

const HOME_DEFAULTS = { ...HOME_TEXTS, ...SHARED_TEXTS };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTexts(HOME_DEFAULTS);
  return {
    title: { absolute: t["home.meta.title"] },
    description: t["home.meta.description"],
    alternates: { canonical: "/" },
    openGraph: {
      title: t["home.meta.ogTitle"],
      description: t["home.meta.ogDescription"],
      url: "/",
    },
  };
}

export default async function Home() {
  const t = await getTexts(HOME_DEFAULTS);
  const siteUrl = getSiteUrl();
  const instagramUrl = safeHttpsUrl(t["shared.teacher.instagramUrl"], SHARED_TEXTS["shared.teacher.instagramUrl"]);
  const first = nextClasses[0];

  return (
    <>
      <JsonLd data={organizationJsonLd(siteUrl)} />
      <JsonLd data={websiteJsonLd(siteUrl)} />

      {/* Hero B */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap">
          <div className="hero-text">
            <p className="eyebrow">{t["home.hero.eyebrow"]}</p>
            <h1 id="hero-h">
              <RichText text={t["home.hero.title"]} />
            </h1>
            <p className="lead">{t["home.hero.lead"]}</p>
            <div className="cta">
              <Link className="btn btn-primary" href="/schedule">
                {t["home.hero.ctaPrimary"]}
              </Link>
              <a className="btn btn-outline" href="#how">
                {t["home.hero.ctaSecondary"]}
              </a>
            </div>
            <ul className="trust">
              <li>
                <Icon name="video" className="size-5!" />{` ${t["home.hero.trust.zoom"]}`}
              </li>
              <li>
                <Icon name="leaf" className="size-5!" />{` ${t["home.hero.trust.levels"]}`}
              </li>
              <li>
                <Icon name="check" className="size-5!" />{` ${t["home.hero.trust.cancel"]}`}
              </li>
            </ul>
          </div>
          <div className="hero-art">
            <div className="hero-ring" aria-hidden="true" />
            <div className="hero-sun" aria-hidden="true" />
            <div className="hero-photo">
              <Image
                src="/real/hero-home-01.webp"
                alt={t["home.hero.imageAlt"]}
                width={650}
                height={812}
                priority
                fetchPriority="high"
                sizes="(min-width: 900px) 430px, 90vw"
              />
            </div>
            <Link
              className="hero-card"
              href="/schedule"
            >
              <span>
                <span className="k">{t["home.hero.card.kicker"]}</span>
                <b>
                  {first.weekday} {first.time} · Online
                </b>
                <small>
                  {first.title} · {first.spotsLeft} spots left
                </small>
              </span>
              <span className="go">
                <Icon name="arrow" className="size-5!" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Next classes (static demo data until Phase 4) */}
      <section className="sec" aria-labelledby="next-h">
        <div className="wrap next-grid">
          <div>
            <p className="eyebrow">{t["home.next.eyebrow"]}</p>
            <h2 id="next-h">{t["home.next.title"]}</h2>
            <p className="lead">{t["home.next.lead"]}</p>
            <Link className="btn btn-outline" href="/schedule">
              {t["home.next.cta"]}
            </Link>
          </div>
          <div>
            <ul className="rows">
              {nextClasses.map((c) => (
                <li className="crow" key={c.id}>
                  <div className="date-box" aria-hidden="true">
                    <b>{c.weekday}</b>
                    <span>weekly</span>
                  </div>
                  <div>
                    <h3>{c.title}</h3>
                    <div className="meta">
                      <Icon name="clock" className="size-[18px]!" />
                      <span>
                        {c.time} · {c.minutes} min
                      </span>
                      <span className="dot" aria-hidden="true" />
                      <span>Online · Zoom</span>
                    </div>
                  </div>
                  <div className="act">
                    <span className={`badge ${c.spotsLeft <= 3 ? "b-low" : "b-spots"}`}>
                      {c.spotsLeft <= 3 && <Icon name="warn" className="size-3.5!" />}
                      {spotsLabel(c.spotsLeft)}
                    </span>
                    <Link
                      className="btn btn-primary btn-sm"
                      href="/schedule"
                      aria-label={`Book ${c.title}, ${c.weekdayLong}, ${c.time}`}
                    >
                      Book
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            <p className="hint mt-3">{t["home.next.hint"]}</p>
          </div>
        </div>
      </section>

      {/* Three ways to practise */}
      <section className="sec sand" aria-labelledby="offers-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <p className="eyebrow">{t["home.offers.eyebrow"]}</p>
              <h2 id="offers-h">{t["home.offers.title"]}</h2>
            </div>
          </div>
          <div className="offers">
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-online">
                  <Icon name="video" className="size-3.5!" />
                  {t["home.offers.classes.badge"]}
                </span>
                <Image
                  src="/demo/online-yoga-laptop.webp"
                  alt={t["home.offers.classes.imageAlt"]}
                  width={800}
                  height={600}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/classes">{t["home.offers.classes.title"]}</Link>
                </h3>
                <p>{t["home.offers.classes.text"]}</p>
                <div className="foot">
                  <span className="price">
                    <small>{`${t["home.offers.classes.pricePrefix"]} `}</small>{priceText(Math.min(...classTypes.filter((c) => c.priceCents > 0).map((c) => c.priceCents)))}
                  </span>
                  <span className="link-arrow">
                    {t["home.offers.classes.link"]} <Icon name="arrow" className="size-[18px]!" />
                  </span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-person">
                  <Icon name="pin" className="size-3.5!" />
                  {t["home.offers.oneToOne.badge"]}
                </span>
                <Image
                  src="/real/card-one-to-one-01.webp"
                  alt={t["home.offers.oneToOne.imageAlt"]}
                  width={480}
                  height={360}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/one-to-one">{t["home.offers.oneToOne.title"]}</Link>
                </h3>
                <p>{t["home.offers.oneToOne.text"]}</p>
                <div className="foot">
                  <span className="price">
                    <small>{`${t["home.offers.oneToOne.pricePrefix"]} `}</small>{priceText(Math.min(...oneToOneOfferings.map((o) => o.priceCents)))}
                  </span>
                  <span className="link-arrow">
                    {t["home.offers.oneToOne.link"]} <Icon name="arrow" className="size-[18px]!" />
                  </span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-free">{t["home.offers.events.badge"]}</span>
                <Image
                  src="/real/card-events-01.webp"
                  alt={t["home.offers.events.imageAlt"]}
                  width={747}
                  height={560}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/events">{t["home.offers.events.title"]}</Link>
                </h3>
                <p>{t["home.offers.events.text"]}</p>
                <div className="foot">
                  <span className="price" style={{ fontSize: "1.05rem" }}>
                    {t["home.offers.events.price"]}
                  </span>
                  <span className="link-arrow">
                    {t["home.offers.events.link"]} <Icon name="arrow" className="size-[18px]!" />
                  </span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="sec" id="how" aria-labelledby="how-h">
        <div className="wrap">
          <h2 id="how-h" style={{ marginBottom: 28 }}>
            {t["home.how.title"]}
          </h2>
          <ol className="steps3">
            <li>
              <span className="n" aria-hidden="true">1</span>
              <div>
                <h3>{t["home.how.step1.title"]}</h3>
                <p>{t["home.how.step1.text"]}</p>
              </div>
            </li>
            <li>
              <span className="n" aria-hidden="true">2</span>
              <div>
                <h3>{t["home.how.step2.title"]}</h3>
                <p>{t["home.how.step2.text"]}</p>
              </div>
            </li>
            <li>
              <span className="n" aria-hidden="true">3</span>
              <div>
                <h3>{t["home.how.step3.title"]}</h3>
                <p>{t["home.how.step3.text"]}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Teacher */}
      <section className="sec sand" aria-labelledby="teacher-h">
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
            <h2 id="teacher-h">{t["shared.teacher.title"]}</h2>
            <p>{t["shared.teacher.bio"]}</p>
            <p>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                {`Instagram: @${t["shared.teacher.instagramName"]}`}
              </a>
            </p>
            <Link className="btn btn-outline" href="/about">
              {t["home.teacher.cta"]}
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials: from the admin (database), code list as fallback; demo ones keep the "Demo review" label (task 12.11) */}
      <HomeTestimonials />

      {/* Newsletter band (UI only) */}
      <section className="sec dark on-dark" id="newsletter" aria-labelledby="nl-h">
        <div className="wrap nl-band">
          <div>
            <p className="eyebrow">{t["home.nl.eyebrow"]}</p>
            <h2 id="nl-h">{t["home.nl.title"]}</h2>
            <p style={{ color: "#E5D5DC", margin: 0 }}>{t["home.nl.text"]}</p>
          </div>
          <HomeNewsletterBand />
        </div>
      </section>

      {/* Final CTA */}
      <section className="sec cta-final" aria-labelledby="cta-h">
        <div className="wrap">
          <h2 id="cta-h">{t["home.cta.title"]}</h2>
          <p>{t["home.cta.text"]}</p>
          <div className="cta">
            <Link className="btn btn-primary" href="/schedule">
              {t["home.cta.primary"]}
            </Link>
            <Link className="btn btn-outline" href="/faq">
              {t["home.cta.secondary"]}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
