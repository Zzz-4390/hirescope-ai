import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const processPagePath = join(process.cwd(), "src/app/process/page.tsx");
const globalStylesPath = join(process.cwd(), "src/app/globals.css");

describe("process page contract", () => {
  it("covers the complete project assessment workflow", () => {
    const page = readFileSync(processPagePath, "utf8");

    expect(page).toContain("从上传项目到生成报告");
    expect(page).toContain("上传项目");
    expect(page).toContain("技术栈识别");
    expect(page).toContain("AI 分析与代码审查");
    expect(page).toContain("AI 模拟面试");
    expect(page).toContain("查看能力报告");
    expect(page).toContain("分享授权");
    expect(page).toContain("完整评估闭环");
  });

  it("uses page-scoped natural reveal motion without scroll hijacking", () => {
    const page = readFileSync(processPagePath, "utf8");
    const css = readFileSync(globalStylesPath, "utf8");

    expect(page).toContain("<ProcessRevealManager />");
    expect(page).toContain("process-reveal-section");
    expect(css).toMatch(/\.process-page\[data-process-reveal-ready="true"\]/);
    expect(css).toContain("translateY(24px)");
    expect(css).toContain("600ms");
    expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)[\s\S]*\.process-page/);
    expect(css).not.toMatch(/\.process-page\{[^}]*scroll-snap-type/);
  });
});
