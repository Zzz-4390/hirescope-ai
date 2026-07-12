import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectDetailClient } from "./ProjectDetailClient";

const projectApi = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectAnalysis: vi.fn(),
  getTask: vi.fn(),
}));

vi.mock("../lib/projects", async () => {
  const actual = await vi.importActual<typeof import("../lib/projects")>("../lib/projects");
  return { ...actual, ...projectApi };
});

describe("ProjectDetailClient", () => {
  beforeEach(() => {
    sessionStorage.clear();
    projectApi.getTask.mockReset();
    projectApi.getProject.mockReset().mockResolvedValue({
      id: "project-1",
      name: "Candidate API",
      description: "Demo",
      originalFileName: "candidate.zip",
      fileSize: 1024,
      status: "COMPLETED",
      failure: null,
      createdAt: "2026-07-11T02:00:00.000Z",
      updatedAt: "2026-07-11T02:00:00.000Z",
    });
    projectApi.getProjectAnalysis.mockReset().mockResolvedValue({
      id: "analysis-1",
      projectId: "project-1",
      summary: "Ready",
      techStack: [],
      directoryTree: [],
      coreModules: [],
      entryFiles: [],
      statistics: {},
      analyzerVersion: "v1",
      createdAt: "2026-07-11T02:00:00.000Z",
      updatedAt: "2026-07-11T02:00:00.000Z",
    });
  });

  it("分析完成后提供代码审查入口", async () => {
    render(<ProjectDetailClient projectId="project-1" />);

    const link = await screen.findByRole("link", { name: "代码审查" });
    expect(link).toHaveAttribute("href", "/app/projects/project-1/review");
  });

  it("首次返回已完成时不轮询遗留任务，并显示静态完成状态", async () => {
    sessionStorage.setItem("hirescope.projectTask.project-1", "task-1");
    projectApi.getTask.mockResolvedValue({ id: "task-1", status: "PROCESSING" });

    render(<ProjectDetailClient projectId="project-1" />);

    expect(await screen.findByText("项目分析已完成，可继续代码审查或模拟面试。")).toBeInTheDocument();
    expect(projectApi.getTask).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("hirescope.projectTask.project-1")).toBeNull();
  });

  it("分析未完成时禁用代码审查与模拟面试入口", async () => {
    projectApi.getProject.mockResolvedValueOnce({
      id: "project-1",
      name: "Candidate API",
      description: "Demo",
      originalFileName: "candidate.zip",
      fileSize: 1024,
      status: "QUEUED",
      failure: null,
      createdAt: "2026-07-11T02:00:00.000Z",
      updatedAt: "2026-07-11T02:00:00.000Z",
    });

    render(<ProjectDetailClient projectId="project-1" />);

    expect(await screen.findByRole("link", { name: "代码审查" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "模拟面试" })).toHaveAttribute("aria-disabled", "true");
  });
});
