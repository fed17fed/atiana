import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DevLoginForm, LoginForm } from "@/components/pages/LoginForms";
import { Icon } from "@/components/ui/Icon";
import { devLoginAllowed, LOGIN_OFF_MESSAGE, magicLinkConfig, safeNextPath } from "@/lib/auth-config";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to KEA by Atiana with an email link.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <section className="sec" aria-labelledby="login-h">
      <div className="narrow" style={{ maxWidth: 560 }}>
        <p className="eyebrow">My account</p>
        <h1 id="login-h">Log in</h1>
        <Suspense fallback={<div style={{ minHeight: 360 }} role="status">Loading...</div>}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function LoginBody({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const sent = sp.sent === "1";
  const failed = sp.error === "1";

  if (await getCurrentUser()) redirect(next);

  const magicOn = magicLinkConfig() !== null;
  const devOn = devLoginAllowed() && !!process.env.AUTH_SECRET;

  if (sent) {
    return (
      <div className="alert a-success" role="status">
        <Icon name="check" />
        <div>
          <b>Check your email</b>
          <p>We sent you a sign-in link. It works once. If you do not see it, look in your spam folder.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <p className="lead">Enter your email. We send you a link, and you are in. New here? The same link creates your account.</p>
      {failed && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div><p>That link did not work or has expired. Please ask for a new one.</p></div>
        </div>
      )}
      {magicOn ? (
        <LoginForm next={next} />
      ) : (
        <div className="alert a-warn" role="status">
          <Icon name="info" />
          <div>
            <b>Demo mode</b>
            <p>{LOGIN_OFF_MESSAGE}</p>
          </div>
        </div>
      )}
      {devOn && <DevLoginForm next={next} emails={["client1@atiana.test", "client2@atiana.test", "admin@atiana.test"]} />}
    </div>
  );
}
