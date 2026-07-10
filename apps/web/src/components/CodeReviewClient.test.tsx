import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AsyncTask, Project } from "../lib/projects";
import type { CodeReview, CodeReviewDetail, CreateCodeReviewResponse } from "../lib/reviews";
import { CodeReviewClient } from "./CodeReviewClient";

const projectApi = vi.hoisted(() => ({
  getProject: vi.fn(),
  getTask: vi.fn(),
}));
const reviewApi = vi.hoisted(() => ({
  createCodeReview: vi.fn(),
  getCodeReview: vi.fn(),
  listCodeReviews: vi.fn(),
}));

vi.mock("../lib/projects", async () => {
  const actual = await vi.importActual<typeof import("../lib/projects")>("../lib/projects");
  return { ...actual, ...projectApi };
});

vi.mock("../lib/reviews", async () => {
  const actual = await vi.importActual<typeof import("../lib/reviews")>("../lib/reviews");
  return { ...actual, ...reviewApi };
});

const project: Project = {
  id: "project-1",
  name: "Candidate API",
  description: null,
  originalFileName: "candidate.zip",
  fileSize: 1024,
  status: "COMPLETED",
  failure: null,
  createdAt: "2026-07-11T02:00:00.000Z",
  updatedAt: "2026-07-11T02:00:00.000Z",
};

const runningTask: AsyncTask = {
  id: "task-1",
  type: "CODE_REVIEW",
  status: "PROCESSING",
  progress: 40,
  failure: null,
};

const completedReview: CodeReviewDetail = {
  id: "review-1",
  status: "SUCCEEDED",
  summary: "总体结构清晰",
  score: 84,
  model: "deterministic-v1",
  failure: null,
  createdAt: "2026-07-11T02:00:00.000Z",
  completedAt: "2026-07-11T02:01:00.000Z",
  task: { ...runningTask, status: "SUCCEEDED", progress: 100 },
  result: {
    overview: "项目分层合理，关键边界清楚。",
    strengths: ["模块职责明确"],
    risks: ["缺少速率限制"],
    suggestions: ["补充边界测试"],
    maintainability: { score: 88, summary: "命名一致" },
    security: { score: 76, summary: "认证完整" },
    performance: { score: 82, summary: "查询路径简洁" },
  },
};

function listResponse(items: CodeReview[]) {
  return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } };
}

describe("CodeReviewClient", () => {
  beforeEach(() => {
    projectApi.getProject.mockReset().mockResolvedValue(project);
    projectApi.getTask.mockReset();
    reviewApi.createCodeReview.mockReset();
    reviewApi.getCodeReview.mockReset();
    reviewApi.listCodeReviews.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("展示完整的代码审查结果", async () => {
    reviewApi.listCodeReviews.mockResolvedValue(listResponse([completedReview]));
    reviewApi.getCodeReview.mockResolvedValue(completedReview);

    render(<CodeReviewClient projectId="project-1" />);

    expect(await screen.findByText("项目分层合理，关键边界清楚。")).toBeInTheDocument();
    expect(screen.getByText("模块职责明确")).toBeInTheDocument();
    expect(screen.getByText("缺少速率限制")).toBeInTheDocument();
    expect(screen.getByText("补充边界测试")).toBeInTheDocument();
    expect(screen.getByText("可维护性")).toBeInTheDocument();
    expect(screen.getByText("安全性")).toBeInTheDocument();
    expect(screen.getByText("性能")).toBeInTheDocument();
  });

  it("空状态下可以创建第一份代码审查", async () => {
    const user = userEvent.setup();
    const created = {
      ...completedReview,
      status: "QUEUED",
      result: null,
      score: null,
      summary: null,
      completedAt: null,
      task: { ...runningTask, status: "QUEUED" },
    } satisfies CreateCodeReviewResponse & CodeReviewDetail;
    reviewApi.listCodeReviews
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce(listResponse([created]));
    reviewApi.createCodeReview.mockResolvedValue(created);
    reviewApi.getCodeReview.mockResolvedValue(created);

    render(<CodeReviewClient projectId="project-1" />);
    expect(await screen.findByText("还没有代码审查结果")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "生成代码审查" })[0]);

    expect(reviewApi.createCodeReview).toHaveBeenCalledWith("project-1");
    expect(await screen.findByText("代码审查已创建，正在生成结果。")).toBeInTheDocument();
  });

  it("刷新页面后恢复运行中的审查并轮询到完成", async () => {
    vi.useFakeTimers();
    const runningReview: CodeReviewDetail = {
      ...completedReview,
      status: "PROCESSING",
      summary: null,
      score: null,
      completedAt: null,
      result: null,
      task: runningTask,
    };
    reviewApi.listCodeReviews
      .mockResolvedValueOnce(listResponse([runningReview]))
      .mockResolvedValueOnce(listResponse([completedReview]));
    reviewApi.getCodeReview
      .mockResolvedValueOnce(runningReview)
      .mockResolvedValueOnce(completedReview);
    projectApi.getTask.mockResolvedValue({ ...runningTask, status: "SUCCEEDED", progress: 100 });

    await act(async () => {
      render(<CodeReviewClient projectId="project-1" />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("代码审查正在生成，页面会自动刷新结果。")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(projectApi.getTask).toHaveBeenCalledWith("task-1");
    expect(screen.getByText("项目分层合理，关键边界清楚。")).toBeInTheDocument();
  });
});
