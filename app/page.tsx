import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { HomeNewsletterBand } from "@/components/pages/HomeNewsletterBand";
import { Icon } from "@/components/ui/Icon";
import { JsonLd } from "@/components/seo/JsonLd";
import { INSTAGRAM_NAME, INSTAGRAM_URL, nextClasses, spotsLabel, TEACHER_BIO, testimonials } from "@/content/home";
import { classTypes } from "@/content/catalog";
import { cancelUpToText, priceText } from "@/lib/booking-rules";
import { organizationJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { getSiteUrl, SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} – live classes, 1:1 sessions and events` },
  description:
    "Warm, simple breath and stillness practice. Live classes on Zoom, 1:1 sessions and events. All levels welcome. Demo site.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} – come home to your own light`,
    description: "Live classes on Zoom, 1:1 sessions and events for breath, energy and stillness.",
    url: "/",
  },
};

export default function Home() {
  const siteUrl = getSiteUrl();
  const first = nextClasses[0];

  return (
    <>
      <JsonLd data={organizationJsonLd(siteUrl)} />
      <JsonLd data={websiteJsonLd(siteUrl)} />

      {/* Hero B */}
      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap">
          <div className="hero-text">
            <p className="eyebrow">Online classes · 1:1 · events</p>
            <h1 id="hero-h">
              Come home to your <em>own light.</em>
            </h1>
            <p className="lead">
              Warm, simple practice you can do from your living room or by the hills in Ireland.
            </p>
            <div className="cta">
              <Link className="btn btn-primary" href="/schedule">
                See the schedule
              </Link>
              <a className="btn btn-outline" href="#how">
                How it works
              </a>
            </div>
            <ul className="trust">
              <li>
                <Icon name="video" className="size-5!" /> Live on Zoom
              </li>
              <li>
                <Icon name="leaf" className="size-5!" /> All levels welcome
              </li>
              <li>
                <Icon name="check" className="size-5!" /> {cancelUpToText()} · free classes any time
              </li>
            </ul>
          </div>
          <div className="hero-art">
            <div className="hero-ring" aria-hidden="true" />
            <div className="hero-sun" aria-hidden="true" />
            <div className="hero-photo">
              <Image
                src="/real/hero-home-01.webp"
                alt="Woman in white sitting in a forest scene with one arm raised and one hand open, eyes closed"
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
                <span className="k">Next class</span>
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
            <p className="eyebrow">This week</p>
            <h2 id="next-h">Next classes</h2>
            <p className="lead">
              Join live from home. Pick a time that fits your day. No experience needed.
            </p>
            <Link className="btn btn-outline" href="/schedule">
              See full schedule
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
            <p className="hint mt-3">Demo times. The live schedule comes with online booking.</p>
          </div>
        </div>
      </section>

      {/* Three ways to practise */}
      <section className="sec sand" aria-labelledby="offers-h">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <p className="eyebrow">Three ways to practise</p>
              <h2 id="offers-h">Ways to practise</h2>
            </div>
          </div>
          <div className="offers">
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-online">
                  <Icon name="video" className="size-3.5!" />
                  Online
                </span>
                <Image
                  src="/demo/online-yoga-laptop.webp"
                  alt="A woman doing a gentle stretch on a mat in front of a laptop at home"
                  width={800}
                  height={600}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/classes">Group classes</Link>
                </h3>
                <p>Live on Zoom, every week. All levels.</p>
                <div className="foot">
                  <span className="price">
                    <small>Free or from </small>{priceText(Math.min(...classTypes.filter((c) => c.priceCents > 0).map((c) => c.priceCents)))}
                  </span>
                  <span className="link-arrow">
                    See classes <Icon name="arrow" className="size-[18px]!" />
                  </span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-person">
                  <Icon name="pin" className="size-3.5!" />
                  Online or in person
                </span>
                <Image
                  src="/demo/singing-bowl-sage.webp"
                  alt="A singing bowl with sage and crystals"
                  width={800}
                  height={600}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/one-to-one">1:1 sessions</Link>
                </h3>
                <p>Personal guidance, online or in person.</p>
                <div className="foot">
                  <span className="price">
                    <small>From </small>€60
                  </span>
                  <span className="link-arrow">
                    Book a session <Icon name="arrow" className="size-[18px]!" />
                  </span>
                </div>
              </div>
            </article>
            <article className="card">
              <div className="media">
                <span className="badge badge-over b-free">Events</span>
                <Image
                  src="/demo/group-circle-room.webp"
                  alt="A group of people sitting in a circle in a bright room"
                  width={800}
                  height={600}
                  sizes="(min-width: 900px) 380px, 90vw"
                />
              </div>
              <div className="body">
                <h3>
                  <Link href="/events">Events</Link>
                </h3>
                <p>Longer sessions and special days. Free, by donation or paid.</p>
                <div className="foot">
                  <span className="price" style={{ fontSize: "1.05rem" }}>
                    Free · donation · paid
                  </span>
                  <span className="link-arrow">
                    See events <Icon name="arrow" className="size-[18px]!" />
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
            How it works
          </h2>
          <ol className="steps3">
            <li>
              <span className="n" aria-hidden="true">1</span>
              <div>
                <h3>Choose a class</h3>
                <p>Pick a time on the schedule. Beginners are very welcome.</p>
              </div>
            </li>
            <li>
              <span className="n" aria-hidden="true">2</span>
              <div>
                <h3>Book and pay</h3>
                <p>Pay once, use a credit, or join a free class.</p>
              </div>
            </li>
            <li>
              <span className="n" aria-hidden="true">3</span>
              <div>
                <h3>Join on Zoom</h3>
                <p>Your link comes by email. {cancelUpToText()} and keep your credit. Free classes: cancel any time before the start.</p>
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
                alt="Portrait of Atiana in a white blouse, eyes closed, in a forest scene"
                width={418}
                height={523}
                sizes="(min-width: 860px) 400px, 90vw"
              />
            </div>
          </div>
          <div>
            <p className="eyebrow">Meet your teacher</p>
            <h2 id="teacher-h">Hello, I am Atiana.</h2>
            <p>{TEACHER_BIO}</p>
            <p>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                Instagram: @{INSTAGRAM_NAME}
              </a>
            </p>
            <Link className="btn btn-outline" href="/about">
              About KEA by Atiana
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials: invented demo reviews, each one is labelled "Demo review" (owner decision 2026-11-12) */}
      <section className="sec" aria-labelledby="quotes-h">
        <div className="wrap">
          <h2 id="quotes-h" style={{ marginBottom: 28 }}>
            What people say
          </h2>
          <div className="quotes">
            {testimonials.map((t) => (
              <figure className="quote" key={t.who}>
                <blockquote>“{t.quote}”</blockquote>
                <figcaption>
                  <span className="who">{t.who}</span>
                  <span className="tag-demo">Demo review</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter band (UI only) */}
      <section className="sec dark on-dark" id="newsletter" aria-labelledby="nl-h">
        <div className="wrap nl-band">
          <div>
            <p className="eyebrow">Newsletter</p>
            <h2 id="nl-h">One calm email a week</h2>
            <p style={{ color: "#E5D5DC", margin: 0 }}>Practice ideas and new dates. No spam.</p>
          </div>
          <HomeNewsletterBand />
        </div>
      </section>

      {/* Final CTA */}
      <section className="sec cta-final" aria-labelledby="cta-h">
        <div className="wrap">
          <h2 id="cta-h">Ready for your first class?</h2>
          <p>Take a few quiet minutes for yourself this week. We will keep a seat for you.</p>
          <div className="cta">
            <Link className="btn btn-primary" href="/schedule">
              Book a class
            </Link>
            <Link className="btn btn-outline" href="/faq">
              Read the questions people ask
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
