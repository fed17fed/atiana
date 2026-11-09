"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/account", label: "Overview" },
  { href: "/account/bookings", label: "My bookings" },
  { href: "/account/credits", label: "My credits" },
  { href: "/account/orders", label: "My orders" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav className="acc-nav" aria-label="My account">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
