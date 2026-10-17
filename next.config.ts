import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the sandbox SDK out of the bundle; it runs server-side only.
  serverExternalPackages: ["freestyle"],
};

export default nextConfig;
