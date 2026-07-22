import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3001";
const monorepoRoot = fileURLToPath(new URL("../..", import.meta.url));
const appCommitSha = process.env.APP_COMMIT_SHA ?? "development";
const nextBuildId = /^[0-9a-f]{40}$/.test(appCommitSha) ? appCommitSha : "development";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  env: {
    NEXT_PUBLIC_APP_COMMIT_SHA: appCommitSha,
    NEXT_PUBLIC_NEXT_BUILD_ID: nextBuildId,
  },
  generateBuildId: async () => nextBuildId,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-App-Commit-Sha", value: appCommitSha },
          { key: "X-Next-Build-Id", value: nextBuildId },
        ],
      },
    ];
  },
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
