import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="sec" aria-labelledby="nf-h">
      <div className="prose-narrow" style={{ textAlign: "center" }}>
        <p className="eyebrow">Error 404</p>
        <h1 id="nf-h">We could not find this page</h1>
        <p className="lead" style={{ marginInline: "auto" }}>
          The link may be old, or the page may have moved. Let us help you find your way.
        </p>
        <div className="cta-final">
          <div className="cta">
            <Link className="btn btn-primary" href="/">
              Go to the home page
            </Link>
            <Link className="btn btn-outline" href="/schedule">
              See the schedule
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
