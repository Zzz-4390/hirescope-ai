import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("home scrolling contract", () => {
  it("uses four section-level reveals without scroll snapping", () => {
    const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(page).toContain("<HomeRevealManager />");
    expect(page).not.toContain('className="home-scroll home-page"');
    expect(css).toMatch(/\.home-page\{[^}]*scroll-snap-type:none/);
    expect(css).not.toMatch(/\.home-page\{[^}]*scroll-snap-type:y/);
    expect(css).not.toMatch(/\.home-page \.snap-section[^}]*scroll-snap/);
  });
});
