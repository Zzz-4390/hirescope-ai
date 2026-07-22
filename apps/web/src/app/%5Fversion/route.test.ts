import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /_version", () => {
  it("returns build identity without allowing caches", async () => {
    const response = GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      commitSha: process.env.NEXT_PUBLIC_APP_COMMIT_SHA ?? "development",
      nextBuildId: process.env.NEXT_PUBLIC_NEXT_BUILD_ID ?? "development",
    });
  });
});
