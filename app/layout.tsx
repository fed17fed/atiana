import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { DemoBar } from "@/components/layout/DemoBar";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getSiteUrl, isIndexingAllowed, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: `${SITE_DESCRIPTION} Demo site.`,
  applicationName: SITE_NAME,
  // Demo site: block search engines unless ALLOW_INDEXING=true (see lib/site.ts).
  robots: isIndexingAllowed()
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IE",
    images: [
      {
        url: "/real/og-share-01.webp",
        width: 999,
        height: 523,
        alt: "Atiana in white in a forest scene with open hands",
      },
    ],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="absolute top-2 -left-[999px] z-300 rounded-lg bg-plum px-4 py-2.5 text-white focus:left-2"
        >
          Skip to content
        </a>
        <DemoBar />
        <SiteHeader />
        <main id="main" tabIndex={-1} className="page flex-1 focus:outline-none">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
