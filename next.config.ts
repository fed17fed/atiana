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
    return [{ source: "/:path*", headers: [...common, ...hsts] }];
  },
  cacheComponents: true,
  experimental: {
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
