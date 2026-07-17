import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
