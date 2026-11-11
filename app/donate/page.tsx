import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DonateForm } from "@/components/donate/DonateForm";
import { Crumbs } from "@/components/ui/Crumbs";
import { Icon } from "@/components/ui/Icon";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { turnstileConfig } from "@/lib/contact-service";
import { mailConfig } from "@/lib/mail";
import { getCurrentUser } from "@/lib/session";
import { stripeConfig } from "@/lib/stripe-service";

export const metadata: Metadata = {
  title: "Donate",
  description: "Your gift helps KEA by Atiana keep classes open to more people. Every amount is welcome. Demo site.",
  alternates: { canonical: "/donate" },
  openGraph: { title: "Donate – KEA by Atiana", url: "/donate" },
};

export default function DonatePage({ searchParams }: PageProps<"/donate">) {
  return (
    <>
      <Crumbs items={[{ label: "Donate" }]} />
      <Suspense fallback={<PageSkeleton minHeight={760} />}>
        <DonateContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function DonateContent({ searchParams }: { searchParams: PageProps<"/donate">["searchParams"] }) {
  const sp = await searchParams;
  const done = sp.done !== undefined;
  const cancelled = sp.cancelled !== undefined;

  if (done) {
    const emailsOff = mailConfig() === null;
    return (
      <section className="sec" aria-labelledby="donate-h">
        <div className="wrap">
          <h1 id="donate-h">Thank you for your gift</h1>
          <div className="alert a-success" role="status" style={{ marginTop: 20, maxWidth: 640 }}>
            <Icon name="check" />
            <div>
              <p>
                Your donation has arrived. It means a lot to us.{" "}
                {emailsOff ? "Demo: receipt emails are not active yet." : "A receipt is on its way to your email."}
              </p>
            </div>
          </div>
          <p style={{ marginTop: 24 }}>
            <Link className="btn btn-primary" href="/">
              Back to the home page
            </Link>
          </p>
        </div>
      </section>
    );
  }

  const user = await getCurrentUser();
  const turnstile = turnstileConfig();

  return (
    <section className="sec" aria-labelledby="donate-h">
      <div className="wrap">
        <h1 id="donate-h">Donate</h1>
        <p className="lead">Your gift helps us keep classes open to more people. Every amount is welcome and appreciated.</p>
        <p style={{ maxWidth: "56ch" }}>
          Donations help us offer a few free or low-cost spots, keep our Zoom account running, and prepare new classes.
        </p>
        <div style={{ marginTop: 28, maxWidth: 560 }}>
          {cancelled && (
            <div className="alert a-info" role="status" style={{ marginBottom: 20 }}>
              <Icon name="info" />
              <div>
                {/* NEW text, needs the owner's OK */}
                <p>The payment was cancelled. You were not charged.</p>
              </div>
            </div>
          )}
          <DonateForm
            defaultEmail={user?.email ?? ""}
            paymentsOn={stripeConfig() !== null}
            emailsOn={mailConfig() !== null}
            turnstileSiteKey={turnstile?.siteKey}
          />
        </div>
      </div>
    </section>
  );
}
