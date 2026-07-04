import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pagePath = join(process.cwd(), "src/app/capabilities/page.tsx");

describe("Product capabilities page", () => {
  it("defines the complete seven-section product story and CTA", () => {
    expect(existsSync(pagePath)).toBe(true);

    const source = readFileSync(pagePath, "utf8");
    const requiredCopy = [
      "从项目审查到能力报告，形成完整评估闭环",
      'number="01" label="项目上传与解析"',
      'number="02" label="AI 项目审查"',
      'number="03" label="AI 模拟面试"',
      'number="04" label="能力报告生成"',
      'number="05" label="分享授权"',
      'number="06" label="面试官辅助评估"',
      'number="07" label="管理员配置"',
      "从项目到面试，从能力到报告",
    ];

    requiredCopy.forEach((copy) => expect(source).toContain(copy));
  });
});
