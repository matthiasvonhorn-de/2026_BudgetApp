import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles everything needed to run without node_modules installed.
  // Required for the Electron desktop build.
  output: "standalone",

  // Prevent Next.js from bundling these packages – they must stay as external
  // requires so their native/WASM bindings are loaded at runtime.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@libsql/client",
  ],
};

export default nextConfig;
