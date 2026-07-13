import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardToolbar } from "./DashboardToolbar";

const projects = [
  {
    id: "project-1",
    name: "校园失物招领系统",
    description: null,
    originalFileName: "project.zip",
    fileSize: 1024,
    status: "COMPLETED" as const,
    failure: null,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  },
  {
    id: "project-2",
    name: "第二个项目",
    description: null,
    originalFileName: "second.zip",
    fileSize: 2048,
    status: "ANALYZING" as const,
    failure: null,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
  },
];

describe("DashboardToolbar", () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockReset();
  });

  it("renders only the current-project context in the second header layer", () => {
    render(<DashboardToolbar projects={projects} selectedId="project-1" onSelect={onSelect} />);

    expect(screen.getByText("当前项目")).toBeInTheDocument();
    expect(screen.getByText("校园失物招领系统")).toBeInTheDocument();
    expect(screen.getByText("分析完成")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "上传项目" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /用户菜单/ })).not.toBeInTheDocument();
  });

  it("preserves the existing project switch behavior", () => {
    render(<DashboardToolbar projects={projects} selectedId="project-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /校园失物招领系统/ }));
    fireEvent.click(screen.getByRole("option", { name: /第二个项目/ }));

    expect(onSelect).toHaveBeenCalledWith("project-2");
  });
});
