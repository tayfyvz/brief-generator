import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep native/server-only packages out of the bundler (pg's optional
  // pg-native import breaks webpack resolution).
  serverExternalPackages: [
    "pg",
    "pdf-parse",
    "@langchain/langgraph-checkpoint-postgres",
  ],
  webpack: (config, { nextRuntime }) => {
    // instrumentation.ts is also compiled for the edge runtime; in dev there
    // is no dead-code elimination of the NEXT_RUNTIME guard, so stub pg out.
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...config.resolve.alias,
        pg: false,
        "pg-native": false,
        [path.resolve(process.cwd(), "lib/boot-node.ts")]: false,
      };
    }
    return config;
  },
};

export default nextConfig;
