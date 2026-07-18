import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const publicPageSources = [
  "src/app/page.tsx",
  "src/app/capabilities/page.tsx",
  "src/app/process/page.tsx",
  "src/app/reports/page.tsx",
  "src/app/roles/page.tsx",
  "src/app/help/page.tsx",
];

describe("public desktop layout scale", () => {
  it("wraps only the six public marketing pages", () => {
    publicPageSources.forEach((sourcePath) => {
      const source = readFileSync(join(appRoot, sourcePath), "utf8");
      expect(source).toContain("PublicSiteLayout");
    });

    const authenticatedLayout = readFileSync(join(appRoot, "src/app/app/layout.tsx"), "utf8");
    expect(authenticatedLayout).not.toContain("PublicSiteLayout");
  });

  it("applies 90% zoom with width, height and fixed-header compensation", () => {
    const css = readFileSync(join(appRoot, "src/app/globals.css"), "utf8");

    expect(css).toContain(".public-site-layout{width:100%;min-height:calc(100vh / .9);zoom:.9;overflow-x:clip}");
    expect(css).toContain(".public-site-layout .site-header{width:calc(100vw / .9)}");
    expect(css).toContain(".public-site-layout .home-page{height:calc(100svh / .9)}");
    expect(css).toContain(".public-site-layout .home-page>section{height:calc(100svh / .9)}");
  });
});
