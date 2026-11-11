"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import {
  accountLink,
  bookLink,
  donateLink,
  isActivePath,
  mainNav,
  mobileSubNav,
} from "@/lib/nav";

const iconBtn =
  "relative size-12 place-items-center rounded-full text-plum hover:bg-sand hover:text-plum";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // While the menu is open: Escape closes it, page does not scroll, wide screens close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 68.75rem)");
    const onWide = () => mq.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-100 border-b border-line bg-cream/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-2 px-5 py-2 nav:gap-4.5 nav:px-7 nav:py-2.5">
        <Link
          href="/"
          aria-label="KEA by Atiana – home"
          className="block flex-none rounded-md"
          onClick={close}
        >
          <Image
            src="/brand/kea-logo-light.svg"
            alt=""
            width={190}
            height={35}
            unoptimized
            priority
            className="h-8 w-auto"
          />
        </Link>

        <nav aria-label="Main" className="hidden nav:block">
          <ul className="flex gap-0.5">
            {mainNav.map((l) => {
              const current = isActivePath(pathname, l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={current ? "page" : undefined}
                    className={`relative block rounded-pill px-3 py-2.5 text-[0.98rem] text-plum hover:bg-sand ${
                      current
                        ? "font-bold after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-sm after:bg-ember"
                        : "font-medium"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-0.5">
          <Link
            href={donateLink.href}
            aria-current={isActivePath(pathname, donateLink.href) ? "page" : undefined}
            className="hidden rounded-pill p-2.5 text-[0.95rem] font-medium text-plum hover:bg-sand hover:text-plum nav:inline-block"
          >
            {donateLink.label}
          </Link>
          <Link
            href={accountLink.href}
            aria-label={accountLink.label}
            className={`${iconBtn} hidden nav:grid`}
          >
            <Icon name="user" />
          </Link>
          <Link
            href={bookLink.href}
            className="btn btn-primary btn-sm ml-2 hidden nav:inline-flex"
          >
            {bookLink.label}
          </Link>
          <button
            ref={menuBtnRef}
            type="button"
            className={`${iconBtn} grid nav:hidden`}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>

      <nav
        id="mobile-menu"
        aria-label="Main menu (mobile)"
        hidden={!open}
        className="h-[calc(100dvh-4.5rem)] overflow-auto border-t border-line bg-cream px-5 pt-1 pb-6 nav:hidden"
      >
        <ul>
          {mainNav.map((l) => {
            const current = isActivePath(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  aria-current={current ? "page" : undefined}
                  className={`flex min-h-14 items-center justify-between border-b border-line font-serif text-xl ${
                    current ? "text-ember-deep" : "text-plum"
                  }`}
                >
                  {l.label}
                  <Icon name="arrow" />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-4.5 pt-3.5 pb-4.5">
          {mobileSubNav.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={close}
              className="inline-flex min-h-11 items-center font-medium text-plum"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <Link href={bookLink.href} onClick={close} className="btn btn-primary btn-block">
          {bookLink.label}
        </Link>
      </nav>
    </header>
  );
}
