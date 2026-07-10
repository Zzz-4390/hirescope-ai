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

  it("提供查看或生成代码审查的入口", async () => {
    render(<ProjectDetailClient projectId="project-1" />);

    const link = await screen.findByRole("link", { name: "查看/生成代码审查" });
    expect(link).toHaveAttribute("href", "/app/projects/project-1/review");
  });
});
