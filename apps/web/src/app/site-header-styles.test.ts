import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = process.cwd();

describe("global SiteHeader visual contract", () => {
  it("has no page-scoped header, navigation or logo visual overrides", () => {
    const css = readFileSync(join(appRoot, "src/app/globals.css"), "utf8");
    const forbiddenSelectors = [
      ".site-header:has(+ .home-page)",
      ".login-page .site-header",
      ".login-page .header-inner",
      ".login-page .desktop-nav",
      ".login-page .header-actions",
      ".login-page .brand",
      ".login-page .logo",
      ".home-page .site-header",
      ".capabilities-page .site-header",
    ];

    forbiddenSelectors.forEach((selector) => expect(css).not.toContain(selector));
  });

  it("keeps active state on the existing current mechanism", () => {
    const source = readFileSync(join(appRoot, "src/components/SiteHeader.tsx"), "utf8");

    expect(source).toContain('current === item.key ? "active" : ""');
    expect(source).toContain('current === "login" ? "active" : ""');
  });

  it("uses lightweight navigation and reference brand typography", () => {
    const css = readFileSync(join(appRoot, "src/app/globals.css"), "utf8");

    expect(css).toContain("font-size:15px;font-weight:400");
    expect(css).toContain(".header-actions .header-cta{color:var(--blue)!important;font-weight:500}");
    expect(css).toContain(".logo-copy strong{font-size:18px;font-weight:650");
    expect(css).toContain(".logo-copy small{margin-top:4px;color:var(--app-theme-muted);font-size:9px;font-weight:400");
  });

  it("defines home and navigation colors through global theme variables", () => {
    const css = readFileSync(join(appRoot, "src/app/globals.css"), "utf8");

    expect(css).toContain("--home-hero-background");
    expect(css).toContain(".home-page{height:100svh");
    expect(css).toContain("background:var(--app-theme-header)");
    expect(css).toContain("html[data-theme=\"dark\"]{color-scheme:dark");
  });
});
