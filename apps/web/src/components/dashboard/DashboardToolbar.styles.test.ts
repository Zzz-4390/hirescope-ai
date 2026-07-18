import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellStyles = readFileSync("src/components/AppShell.module.css", "utf8").replace(/\s+/g, "");
const dashboardStyles = readFileSync("src/components/dashboard/Dashboard.module.css", "utf8").replace(/\s+/g, "");

describe("authenticated two-layer navigation styles", () => {
  it("fixes both header layers and reserves their combined height in page flow", () => {
    expect(shellStyles).toContain(".primaryHeader{position:fixed;z-index:100;top:0;left:0;right:0;height:var(--app-primary-header-height)");
    expect(shellStyles).toContain(".frame{padding-top:calc(var(--app-primary-header-height)+var(--app-context-bar-height))");
    expect(dashboardStyles).toContain(".toolbar{position:fixed;z-index:90;top:var(--app-primary-header-height);left:0;right:0;height:var(--app-context-bar-height)");
  });

  it("uses the requested desktop heights, restrained surfaces, and responsive overflow protection", () => {
    expect(shellStyles).toContain("--app-primary-header-height:72px;--app-context-bar-height:56px");
    expect(shellStyles).toContain("backdrop-filter:saturate(140%)blur(12px)");
    expect(shellStyles).toContain("border-bottom:1pxsolid#e5eaf0");
    expect(shellStyles).toContain("@media(max-width:900px)");
  });

  it("aligns both navigation layers and dashboard content to one centered container", () => {
    expect(shellStyles).toContain("--app-content-max-width:1480px;--app-page-gutter:46px");
    expect(shellStyles).toContain(".primaryInner{width:min(calc(100%-var(--app-page-gutter)-var(--app-page-gutter)),var(--app-content-max-width))");
    expect(dashboardStyles).toContain(".toolbarInner{width:min(calc(100%-var(--app-page-gutter)-var(--app-page-gutter)),var(--app-content-max-width))");
    expect(dashboardStyles).toContain(".dashboardPage{width:min(calc(100%-var(--app-page-gutter)-var(--app-page-gutter)),var(--app-content-max-width));margin:0auto;padding:0040px");
  });

  it("supersedes legacy toolbar offsets and keeps the content directly below the fixed headers", () => {
    expect(dashboardStyles.lastIndexOf(".toolbar{position:fixed")).toBeGreaterThan(dashboardStyles.lastIndexOf(".toolbar{position:sticky"));
    expect(dashboardStyles).not.toContain(".toolbar{position:fixed;z-index:90;top:0");
    expect(dashboardStyles).toContain(".welcome{padding:32px016px}");
    expect(dashboardStyles).toContain(".dashboardLoading{min-height:calc(var(--desktop-layout-dynamic-height,100dvh)-var(--app-primary-header-height)-var(--app-context-bar-height))");
    expect(dashboardStyles).toContain(".emptyTrackLayout{display:grid;grid-template-columns:minmax(0,1fr)230px");
  });
});
