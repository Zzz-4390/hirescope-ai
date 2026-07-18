import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appRoot = process.cwd();
const readSource = (sourcePath: string) => readFileSync(join(appRoot, sourcePath), "utf8");

describe("shared desktop scale layout", () => {
  it("wraps every route once at the root layout", () => {
    const rootLayout = readSource("src/app/layout.tsx");
    const desktopLayout = readSource("src/components/DesktopScaleLayout.tsx");

    expect(rootLayout).toContain('import { DesktopScaleLayout } from "../components/DesktopScaleLayout"');
    expect(rootLayout).toContain("<body><DesktopScaleLayout>{children}</DesktopScaleLayout></body>");
    expect(desktopLayout).toContain('className="desktop-scale-layout"');

    [
      "src/app/page.tsx",
      "src/app/login/page.tsx",
      "src/app/register/page.tsx",
      "src/app/app/layout.tsx",
    ].forEach((sourcePath) => {
      expect(readSource(sourcePath)).not.toContain("DesktopScaleLayout");
    });
  });

  it("centralizes 90% zoom and compensated viewport dimensions", () => {
    const css = readSource("src/app/globals.css");
    const compactCss = css.replace(/\s+/g, "");

    expect(compactCss).toContain("@media(min-width:1024px)");
    expect(compactCss).toContain(".desktop-scale-layout{--desktop-layout-viewport-width:calc(100vw/.9);--desktop-layout-viewport-height:calc(100vh/.9);--desktop-layout-dynamic-height:calc(100dvh/.9);--desktop-layout-small-height:calc(100svh/.9);width:100%;min-height:var(--desktop-layout-viewport-height);zoom:.9;overflow-x:clip}");
    expect(css).toMatch(/\.desktop-scale-layout\s+:is\(\.site-header,\.app-primary-header,\.app-context-toolbar\)\{right:auto;width:var\(--desktop-layout-viewport-width\)\}/);
    expect(compactCss).toContain(".desktop-scale-layout>:is(.capabilities-page,.process-page,.role-entry-page),.desktop-scale-layout>.home-page>section:first-of-type{padding-top:0}");
    expect(css).toMatch(/\.desktop-scale-layout\s+\.home-page,\.desktop-scale-layout\s+\.home-page>section\{height:var\(--desktop-layout-small-height\)\}/);
    expect(css).toMatch(/\.desktop-scale-layout\s+\.login-page\{height:var\(--desktop-layout-dynamic-height\)\}/);
    expect(css).toMatch(/\.desktop-scale-layout\s+\.app-loading\{min-height:var\(--desktop-layout-viewport-height\)\}/);
  });

  it("compensates fixed app navigation and workspace height consumers", () => {
    const appShell = readSource("src/components/AppShell.tsx");
    const toolbar = readSource("src/components/dashboard/DashboardToolbar.tsx");
    const shellStyles = readSource("src/components/AppShell.module.css").replace(/\s+/g, "");
    const dashboardStyles = readSource("src/components/dashboard/Dashboard.module.css").replace(/\s+/g, "");
    const profileStyles = readSource("src/components/profile/ProfileCenter.module.css").replace(/\s+/g, "");

    expect(appShell).toContain("app-primary-header");
    expect(toolbar).toContain("app-context-toolbar");
    expect(shellStyles).toContain("min-height:var(--desktop-layout-viewport-height,100vh)");
    expect(dashboardStyles).toContain("min-height:calc(var(--desktop-layout-dynamic-height,100dvh)-var(--app-primary-header-height)-var(--app-context-bar-height))");
    expect(profileStyles).toContain("min-height:calc(var(--desktop-layout-viewport-height,100vh)-72px)");
  });
});
