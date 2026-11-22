"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/app/login/actions";
import { adminNav, isAdminNavActive } from "@/lib/admin/nav";

/**
 * Wireframe A1. Mobile: dark bar with a Menu button (aria-expanded, Escape closes and returns focus).
 * From 1024 px: the menu is a sidebar that is always visible (CSS only, see admin.css).
 * Screens that are not built yet show a "Soon" label instead of a link.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="adm">
      <div className="adm-bar">
        <b>KEA admin</b>
        <button
          ref={btnRef}
          type="button"
          className="adm-menu-btn"
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen((v) => !v)}
        >
          Menu
        </button>
      </div>
      <div className="adm-body">
        <nav id="admin-nav" className="adm-nav" data-open={open} aria-label="Admin">
          {adminNav.map((group) => (
            <div key={group.label} className="adm-group">
              <p className="adm-group-title">{group.label}</p>
              <ul>
                {group.items.map((item) => {
                  if (!item.built) {
                    return (
                      <li key={item.href}>
                        <span className="adm-link adm-soon">
                          {item.label} <span className="adm-soon-tag">Soon</span>
                          <span className="sr-only"> (coming soon, not available yet)</span>
                        </span>
                      </li>
                    );
                  }
                  const active = isAdminNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        prefetch={false}
                        className="adm-link"
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <a className="adm-link adm-viewsite" href="/" target="_blank" rel="noopener noreferrer">
            View site<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <form action={logout}>
            <button type="submit" className="adm-link adm-logout">
              Log out
            </button>
          </form>
        </nav>
        <div className="adm-main">{children}</div>
      </div>
    </div>
  );
}
