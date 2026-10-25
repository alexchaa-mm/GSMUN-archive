import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Offline tests must not overwrite a deployable build with blank credentials.
  distDir: process.env.GSMUN_OFFLINE_VERIFY === "1" ? ".local/offline-next" : "dist",
  basePath: "",
  trailingSlash: true,
  allowedDevOrigins: ["192.168.0.94"],
  experimental: { proxyClientMaxBodySize: "32mb" },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
