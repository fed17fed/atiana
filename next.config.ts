import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  poweredByHeader: false,
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    // HSTS only in production builds (never on localhost). No includeSubDomains/preload on purpose.
    const hsts =
      process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
        : [];
    // Admin: never indexed (also meta robots in the layout) and never cached by browsers or proxies.
    const admin = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
      { key: "Cache-Control", value: "no-store, max-age=0" },
    ];
    return [
      { source: "/:path*", headers: [...common, ...hsts] },
      { source: "/admin/:path*", headers: admin },
    ];
  },
  cacheComponents: true,
  images: {
    // Uploaded images on live are on Vercel Blob (task 12.12). Locally they come from /uploads (same site).
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  experimental: {
    // Image upload (task 12.12): the browser shrinks big photos first; Vercel itself accepts about 4.5 MB per request.
    serverActions: { bodySizeLimit: "4mb" },
    // Lets /admin answer 403 (forbidden.tsx) for logged-in users who are not admins.
    authInterrupts: true,
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
