import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description:
    "KEA by Atiana is a small, friendly space for breath, energy and stillness. Meet the demo teacher and see what to expect in a class.",
  alternates: { canonical: "/about" },
  openGraph: { title: "About KEA by Atiana", url: "/about" },
};

const values = [
  { title: "Gentle", text: "We go at your pace. You can rest, skip or sit out any part of a class." },
  { title: "Clear", text: "We use simple words and short steps. No special terms, no pressure." },
  { title: "Welcoming", text: "All levels, all bodies, all backgrounds. Camera on or off, you belong here." },
];

const expect = [
  { title: "Before", text: "You get an email with your Zoom link. Find a quiet spot and sit on a chair or the floor. Wear comfortable clothes. Have water nearby." },
  { title: "At the start", text: "We open the room 10 minutes early. The teacher says hello and explains the plan." },
  { title: "During the class", text: "We move slowly, breathe and rest. You can keep your camera off. You can stop at any time." },
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
        <div className="wrap story">
          <h2 id="story-h">Our story</h2>
          <p>KEA began with a simple idea. Everyone should have a quiet place to stop for a moment.</p>
          <p>
            Aoife Brennan, our demo teacher, found breath practice in a long, grey winter in Galway.
            She was tired and busy. A friend showed her a few slow breaths before work. It took five
            minutes. The day felt a little softer. She kept going, one morning at a time.
          </p>
          <p>
            Over the years she studied with different teachers and practised on her own. She learned
            that you do not need a special room, special clothes or a calm mind. You need a chair, a
            floor or a bed. You need a little time. And it helps to have someone to guide you.
          </p>
          <p>
            First she taught friends in her kitchen. Then people asked for classes they could join
            from home. So she moved the classes to Zoom. Now people join from Dublin, Cork, Galway
            and from far away. Some come every week. Some come once in a while. Both are fine.
          </p>
          <p>
            We keep our groups small. We use plain words. We explain every step. If you are new, we
            will not rush you. If you have practised for years, there is always something fresh to
            notice.
          </p>
          <p>
            KEA is not a medical service. We do not treat illness and we do not make promises about
            results. We offer a calm hour, a clear guide and a kind group. Many people tell us they
            feel more relaxed after class. We hope you will too.
          </p>
          <p>
            We also love to share. You can invite a friend with your link, or join one of our
            events. Everything is made to help you build a small, steady habit.
          </p>
          <p>Thank you for being here. We look forward to practising with you.</p>
          <p className="hint">
            Demo text. The story, the teacher and the photos are invented for this demo. [OWNER:
            real story, real teacher names]
          </p>
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
