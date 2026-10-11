import { loadEnvConfig } from "@next/env";
import path from "node:path";
import type { NextConfig } from "next";

loadEnvConfig(path.resolve(__dirname, "../.."), true, undefined, true);

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@chroma/core", "@chroma/db", "@chroma/providers"],
  experimental: {
    externalDir: true,
  },
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
