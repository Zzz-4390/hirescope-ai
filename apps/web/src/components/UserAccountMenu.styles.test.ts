import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/components/UserAccountMenu.module.css"), "utf8");

describe("UserAccountMenu theme styles", () => {
  it("keeps the open menu content visible in dark mode", () => {
    expect(css).toContain(':global(html[data-theme="dark"]) .accountMenuOpen');
    expect(css).toContain("background:var(--app-theme-surface);color:var(--app-theme-text)");
    expect(css).toContain(".accountMenuOpen svg{color:var(--app-theme-text)}");
  });

  it("uses theme variables instead of component color literals", () => {
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
    expect(css).toContain("color:var(--app-theme-danger)");
    expect(css).toContain("color-mix(in srgb,var(--app-theme-accent)");
  });
});
