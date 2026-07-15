import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const reportStyles = css.slice(
  css.indexOf("/* Interview report content only. */"),
  css.indexOf("/* Interview answering page:"),
);

describe("InterviewReportClient theme styles", () => {
  it("uses app theme tokens for every report surface and state", () => {
    [
      ".report-overview-panel",
      ".report-ai-summary",
      ".report-dimension-grid",
      ".report-list",
      ".question-review-accordion",
      ".question-review-detail",
      ".interview-report-error-panel",
      ".interview-report-page .primary-button",
    ].forEach((selector) => expect(reportStyles).toContain(selector));

    [
      "--app-theme-surface",
      "--app-theme-surface-muted",
      "--app-theme-text",
      "--app-theme-muted",
      "--app-theme-border",
      "--app-theme-accent",
      "--app-theme-success",
      "--app-theme-warning",
      "--app-theme-danger",
    ].forEach((token) => expect(reportStyles).toContain(`var(${token})`));
  });

  it("does not regress to hard-coded colors in report-only styles", () => {
    expect(reportStyles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(css).toContain("--report-theme-border:color-mix(in srgb,var(--app-theme-border) 68%,var(--app-theme-text))");
    expect(css).toContain('html[data-theme="dark"] .app-authenticated-shell .interview-report-page .question-review-detail{background-color:var(--app-theme-surface-muted)}');
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--app-theme-success:[^;}]+/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--app-theme-warning:[^;}]+/);
    expect(css).toMatch(/html\[data-theme="dark"\]\{[^}]*--app-theme-danger:[^;}]+/);
  });
});
