import { describe, expect, it } from "vitest";

import { setTheme, themeInitializationScript } from "./theme";

describe("theme state", () => {
  it("writes the selected theme to document.documentElement and persists it", () => {
    setTheme("dark");

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(window.localStorage.getItem("hirescope-theme")).toBe("dark");
  });

  it("initializes the root theme before hydration from persisted storage", () => {
    expect(themeInitializationScript).toContain("document.documentElement");
    expect(themeInitializationScript).toContain('localStorage.getItem("hirescope-theme")');
    expect(themeInitializationScript).toContain("root.style.colorScheme = theme");
  });
});
