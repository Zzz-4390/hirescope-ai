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
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

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
    navigation.push.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("不再直接展示结果，并使用真实审查 ID 跳转详情页", async () => {
    const user = userEvent.setup();
    reviewApi.listCodeReviews.mockResolvedValue(listResponse([completedReview]));
    reviewApi.getCodeReview.mockResolvedValue(completedReview);

    render(<CodeReviewClient projectId="project-1" />);

    expect(await screen.findByRole("link", { name: "查看审查结果" })).toHaveAttribute("href", "/app/code-reviews/review-1?projectId=project-1");
    expect(screen.queryByText("项目分层合理，关键边界清楚。")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /代码审查/ }));
    expect(navigation.push).toHaveBeenCalledWith("/app/code-reviews/review-1?projectId=project-1");
    expect(screen.getAllByText("可维护性").length).toBeGreaterThan(0);
    expect(screen.getAllByText("安全性").length).toBeGreaterThan(0);
    expect(screen.getAllByText("性能").length).toBeGreaterThan(0);
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
    expect(await screen.findByText("还没有生成过代码审查")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "开始代码审查" }));

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
    expect(screen.getByText("代码审查进行中")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(projectApi.getTask).toHaveBeenCalledWith("task-1");
    expect(screen.getByRole("link", { name: "查看审查结果" })).toHaveAttribute("href", "/app/code-reviews/review-1?projectId=project-1");
  });

  it("任务完成但没有有效结果时不显示零分或完成进度", async () => {
    const emptyReview: CodeReviewDetail = {
      ...completedReview,
      score: null,
      summary: null,
      result: null,
      task: { ...runningTask, status: "SUCCEEDED", progress: 100 },
    };
    reviewApi.listCodeReviews.mockResolvedValue(listResponse([emptyReview]));
    reviewApi.getCodeReview.mockResolvedValue(emptyReview);

    render(<CodeReviewClient projectId="project-1" />);

    expect(await screen.findAllByText("无法生成有效评分")).not.toHaveLength(0);
    expect(screen.queryByRole("link", { name: "查看审查结果" })).not.toBeInTheDocument();
    expect(screen.queryByText("0/100")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
