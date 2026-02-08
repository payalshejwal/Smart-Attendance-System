import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Remove deprecated experimental keys
  experimental: {
    // You can still add valid keys here (e.g. serverActions, optimizeCss)
  },
};

export default nextConfig;
