/**
 * Admin navigation (wireframe A1). `built: false` = the screen does not exist yet:
 * the menu shows the name with a "Soon" label and no link (no 404 clicks).
 * When a screen is built, set `built: true`. Nothing else changes.
 */
export type AdminNavItem = { href: string; label: string; built: boolean };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  { label: "Start", items: [{ href: "/admin", label: "Overview", built: true }] },
  {
    label: "Content",
    items: [
      { href: "/admin/texts", label: "Texts", built: true },
      { href: "/admin/legal", label: "Legal pages", built: true },
      { href: "/admin/images", label: "Images", built: true },
    ],
  },
  {
    label: "Offerings",
    items: [
      { href: "/admin/offerings", label: "Classes and events", built: true },
      { href: "/admin/sessions", label: "Sessions", built: true },
      { href: "/admin/slots", label: "1:1 slots", built: true },
      { href: "/admin/packages", label: "Packages", built: true },
    ],
  },
  {
    label: "People and orders",
    items: [
      { href: "/admin/testimonials", label: "Testimonials", built: true },
      { href: "/admin/bookings", label: "Bookings", built: true },
      { href: "/admin/orders", label: "Orders", built: true },
      { href: "/admin/subscribers", label: "Subscribers", built: true },
      { href: "/admin/referrals", label: "Referrals", built: true },
      { href: "/admin/messages", label: "Messages", built: true },
    ],
  },
];

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
