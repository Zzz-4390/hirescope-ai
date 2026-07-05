import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("report example page", () => {
  it("contains every required report section", () => {
    const page = readFileSync(join(process.cwd(), "src/app/reports/page.tsx"), "utf8");
    ["能力报告，一目了然", "综合能力概览", "AI 审查摘要", "模拟面试表现", "改进建议与导出", "导出 PDF 报告"].forEach((text) => expect(page).toContain(text));
  });

  it("uses scoped natural reveal motion", () => {
    const page = readFileSync(join(process.cwd(), "src/app/reports/page.tsx"), "utf8");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(page).toContain("<ReportRevealManager");
    expect(css).toContain('.report-example-page[data-report-reveal-ready="true"]');
    expect(css).toContain("translateY(24px)");
    expect(css).not.toMatch(/\.report-example-page\{[^}]*scroll-snap-type/);
  });
});
