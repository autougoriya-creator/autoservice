import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cookie mock-auth reads session at request time. Cache Components / PPR
  // can be re-enabled when auth moves behind Suspense + "use cache: private".
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
