import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import path from "node:path";

loadEnvConfig(path.resolve(__dirname, "../.."), true, undefined, true);

const nextConfig: NextConfig = {};

export default nextConfig;
