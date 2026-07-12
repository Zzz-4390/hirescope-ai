import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyDashboard } from "./EmptyDashboard";

describe("EmptyDashboard", () => {
  it("shows the complete pending workflow without fabricated results", () => {
    render(<EmptyDashboard greeting="下午好" userName="测试用户" />);

    expect(screen.getByRole("heading", { name: "下午好，测试用户" })).toBeInTheDocument();
    expect(screen.getByText("可开始")).toBeInTheDocument();
    expect(screen.getAllByText("未解锁")).toHaveLength(4);
    expect(screen.getByText("AI 代码审查")).toBeInTheDocument();
    expect(screen.getByText("报告待生成")).toBeInTheDocument();
    expect(screen.getByText("报告生成条件")).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/100/)).not.toBeInTheDocument();
  });
});
