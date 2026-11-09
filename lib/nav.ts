export type NavLink = { label: string; href: string };

/** Five main links: desktop header and mobile menu. */
export const mainNav: NavLink[] = [
  { label: "Classes", href: "/classes" },
  { label: "1:1 Sessions", href: "/one-to-one" },
  { label: "Events", href: "/events" },
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
];

export const donateLink: NavLink = { label: "Donate", href: "/donate" };
export const bookLink: NavLink = { label: "Book a class", href: "/schedule" };
export const accountLink: NavLink = { label: "Log in", href: "/login" };
export const cartLink: NavLink = { label: "Cart", href: "/cart" };

/** Small links under the mobile menu list. */
export const mobileSubNav: NavLink[] = [
  accountLink,
  donateLink,
  { label: "Refer a friend", href: "/refer" },
];

export type FooterColumn = { title: string; links: NavLink[] };

export const footerColumns: FooterColumn[] = [
  {
    title: "Practice",
    links: [
      { label: "Classes", href: "/classes" },
      { label: "Schedule", href: "/schedule" },
      { label: "1:1 Sessions", href: "/one-to-one" },
      { label: "Events", href: "/events" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Shop", href: "/shop" },
      { label: "About", href: "/about" },
      { label: "Refer a friend", href: "/refer" },
      { label: "Donate", href: "/donate" },
      { label: "FAQ", href: "/faq" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Cookie Policy", href: "/legal/cookies" },
      { label: "Terms & Conditions", href: "/legal/terms" },
      { label: "Booking & Cancellation", href: "/legal/booking-cancellation" },
      { label: "Health Disclaimer", href: "/legal/health-disclaimer" },
    ],
  },
];

/** True when `pathname` is the link itself or a page below it (for aria-current). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return clean === href || clean.startsWith(`${href}/`);
}
