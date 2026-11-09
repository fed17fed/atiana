import type { Metadata } from "next";
import { ContactForm } from "@/components/pages/ContactForm";
import { turnstileConfig } from "@/lib/contact-service";

export const metadata: Metadata = {
  title: "Contact",
  description: "Write to KEA by Atiana with any question. We usually answer within 2 working days.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact KEA by Atiana", url: "/contact" },
};

export default function ContactPage() {
  const turnstile = turnstileConfig();

  return (
    <section className="sec" aria-labelledby="contact-h">
      <div className="wrap">
        <p className="eyebrow">Get in touch</p>
        <h1 id="contact-h">Contact</h1>
        <p className="lead">
          Write to us with any question. We usually answer within 2 working days.
        </p>
        <div className="contact-grid" style={{ marginTop: 28 }}>
          <ContactForm turnstileSiteKey={turnstile?.siteKey} />
          <aside className="contact-card" aria-label="Contact details">
            <dl>
              <div>
                <dt>Email</dt>
                <dd>[CONTACT EMAIL]</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>[ADDRESS], Ireland</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>[COMPANY NAME] · [CRO NUMBER]</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 18, marginBottom: 0 }}>
              Classes are online. This is not an address for visits.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
