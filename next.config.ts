import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/archive/**/*": ["./data/knockout/**/*"],
  },
};

export default nextConfig;
