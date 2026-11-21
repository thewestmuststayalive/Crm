import type { NextConfig } from "next";

// Cache Components er slået fra: CRM'et er bag login og næsten alt er
// dynamisk pr. bruger, så den klassiske dynamiske rendering er enklest.
const nextConfig: NextConfig = {
  cacheComponents: false,
  experimental: {
    // Import af kundelister sendes som fil til en server action. Vercel tillader højst 4,5 MB pr. request.
    serverActions: { bodySizeLimit: "4.4mb" },
  },
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
