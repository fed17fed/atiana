import Image from "next/image";
import Link from "next/link";
import { footerColumns } from "@/lib/nav";
import { NewsletterMiniForm } from "./NewsletterMiniForm";

export function SiteFooter() {
  return (
    <footer className="bg-plum pt-12 pb-6 text-cream">
      <div className="wrap">
        <div className="grid gap-7 min-[760px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Image
              src="/brand/kea-logo-dark.svg"
              alt="KEA by Atiana"
              width={190}
              height={35}
              unoptimized
              className="h-[34px] w-auto"
            />
            <p className="mt-3 mb-4 max-w-[34ch] text-sm text-[#D9C6CF]">
              Live classes, 1:1 sessions and events for breath, energy and stillness.
            </p>
            <NewsletterMiniForm />
          </div>
          {footerColumns.map((col) => (
            <nav key={col.title} aria-labelledby={`ftr-${col.title}`}>
              <h2
                id={`ftr-${col.title}`}
                className="mb-3 font-sans text-xs font-bold tracking-[0.14em] text-[#FFB59B] uppercase"
              >
                {col.title}
              </h2>
              <ul className="grid gap-0.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="focus-light inline-block min-h-10 py-2 underline-offset-4 hover:text-[#FFB59B]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-7 flex flex-wrap justify-between gap-x-6 gap-y-2.5 border-t border-[#4B3743] pt-4.5 text-[0.875rem] text-[#D9C6CF]">
          <span>© KEA by Atiana · [COMPANY NAME] · [ADDRESS], Ireland · [CRO NUMBER]</span>
          <span>DEMO site – demo content</span>
        </div>
      </div>
    </footer>
  );
}
