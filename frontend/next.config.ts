import type { NextConfig } from "next";

const backendBaseUrl = (process.env.INTERNAL_API_BASE_URL ?? "http://backend:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/storefront/:path*",
        destination: `${backendBaseUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
