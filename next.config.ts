import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.experiments = { ...config.experiments, topLevelAwait: true }; // Enable top-level await for WebSocket handling
    return config;
  },
};

export default nextConfig;
