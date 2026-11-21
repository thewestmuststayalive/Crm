import type { NextConfig } from "next";

// Cache Components er slået fra: CRM'et er bag login og næsten alt er
// dynamisk pr. bruger, så den klassiske dynamiske rendering er enklest.
const nextConfig: NextConfig = {
  cacheComponents: false,
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
