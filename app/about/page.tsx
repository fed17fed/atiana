import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { INSTAGRAM_NAME, INSTAGRAM_URL, TEACHER_BIO } from "@/content/home";
import { JOIN_EARLY_MINUTES } from "@/lib/booking-rules";

export const metadata: Metadata = {
  title: "About",
  description:
    "KEA by Atiana is a small, friendly space for breath, energy and stillness. Meet Atiana and see what to expect in a session.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About KEA by Atiana", url: "/about" },
};

const values = [
  { title: "Gentle", text: "We go at your pace. You can rest, skip or sit out any part of a class." },
  { title: "Clear", text: "We use simple words and short steps. No special terms, no pressure." },
  { title: "Welcoming", text: "All levels, all bodies, all backgrounds. You belong here." },
];

const expect = [
  { title: "Before", text: "You get an email with your Zoom link. Find a quiet spot with a yoga mat or a comfy rug. Wear comfortable clothes. Have water nearby." },
  { title: "At the start", text: `Please join ${JOIN_EARLY_MINUTES} minutes before the start. Doors close at the start time, and we cannot let you in later.` },
  { title: "During the class", text: "You lie down, listen to music and allow what arises. Please keep your camera on, with your full body visible. You can stop at any time." },
  { title: "After", text: "There is a short quiet minute. You can ask questions. Then you get a short thank-you email." },
];

export default function AboutPage() {
  return (
    <>
      <section className="sec" aria-labelledby="about-h">
        <div className="wrap split">
          <div>
            <p className="eyebrow">About us</p>
            <h1 id="about-h">About KEA by Atiana</h1>
            <p className="lead">A small, friendly space for breath, energy and stillness.</p>
          </div>
          <div className="photo-rounded">
            <Image
              src="/demo/yoga-studio-windows.webp"
              alt="A bright yoga studio with large windows and natural light"
              width={1200}
              height={800}
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
                alt="Portrait of Atiana in a white blouse, eyes closed, in a forest scene"
                width={418}
                height={523}
                sizes="(min-width: 860px) 400px, 90vw"
              />
            </div>
          </div>
          <div>
            <p className="eyebrow">Meet your teacher</p>
            <h2 id="story-h">Hello, I am Atiana.</h2>
            <p>{TEACHER_BIO}</p>
            <p>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                Instagram: @{INSTAGRAM_NAME}
              </a>
            </p>
            <p>
              KEA is not a medical service. We do not treat illness and we do not make promises about results. Please
              read our <Link href="/legal/health-disclaimer">Health notice</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="values-h">
        <div className="wrap">
          <h2 id="values-h" style={{ marginBottom: 28 }}>
            Our values
          </h2>
          <div className="values">
            {values.map((v) => (
              <div className="value" key={v.title}>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sand" aria-labelledby="expect-h">
        <div className="wrap">
          <h2 id="expect-h" style={{ marginBottom: 28 }}>
            What to expect in a class
          </h2>
          <ol className="expect">
            {expect.map((e) => (
              <li key={e.title}>
                <h3>{e.title}</h3>
                <p>{e.text}</p>
              </li>
            ))}
          </ol>
          <p className="hint" style={{ marginTop: 18 }}>
            Classes are not medical care. See our{" "}
            <Link href="/legal/health-disclaimer">Health notice</Link>.
          </p>
          <Link className="btn btn-primary" href="/schedule">
            Book your first class
          </Link>
        </div>
      </section>
    </>
  );
}
