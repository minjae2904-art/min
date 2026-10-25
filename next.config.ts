import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build id for the "update ready" toast (/api/version vs the client bundle). Deterministic per commit;
  // "dev" (local builds) turns the check off.
  env: { KROB_BUILD: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev" },
  // The service worker must never be cached, or installed iPhones keep running an old version.
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
