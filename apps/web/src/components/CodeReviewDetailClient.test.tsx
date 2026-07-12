import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "../lib/projects";
import type { CodeReviewDetail } from "../lib/reviews";
import { CodeReviewDetailClient } from "./CodeReviewDetailClient";

const projectApi = vi.hoisted(() => ({ getProject: vi.fn() }));
const reviewApi = vi.hoisted(() => ({ getCodeReview: vi.fn() }));

vi.mock("../lib/projects", async () => ({ ...(await vi.importActual<typeof import("../lib/projects")>("../lib/projects")), ...projectApi }));
vi.mock("../lib/reviews", async () => ({ ...(await vi.importActual<typeof import("../lib/reviews")>("../lib/reviews")), ...reviewApi }));

const project: Project = { id: "project-1", name: "Candidate API", description: null, originalFileName: "candidate.zip", fileSize: 1024, status: "COMPLETED", failure: null, createdAt: "2026-07-11T02:00:00.000Z", updatedAt: "2026-07-11T02:00:00.000Z" };
const review: CodeReviewDetail = {
  id: "review-1", status: "SUCCEEDED", summary: "总体结构清晰", score: 84, model: "deterministic-v1", failure: null,
  createdAt: "2026-07-11T02:00:00.000Z", completedAt: "2026-07-11T02:01:00.000Z", task: null,
  result: { overview: "项目分层合理。", strengths: ["模块职责明确"], risks: ["缺少速率限制"], suggestions: ["补充边界测试"], maintainability: { score: 88, summary: "命名一致" }, security: { score: 76, summary: "认证完整" }, performance: { score: 82, summary: "查询路径简洁" } },
};

describe("CodeReviewDetailClient", () => {
  beforeEach(() => {
    projectApi.getProject.mockReset().mockResolvedValue(project);
    reviewApi.getCodeReview.mockReset().mockResolvedValue(review);
  });

  it("按 URL 中的真实审查 ID 加载并展示结果", async () => {
    render(<CodeReviewDetailClient codeReviewId="review-1" projectId="project-1" />);

    expect(await screen.findByText("项目分层合理。")).toBeInTheDocument();
    expect(reviewApi.getCodeReview).toHaveBeenCalledWith("review-1");
    expect(screen.getByText("模块职责明确")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回代码审查页/ })).toHaveAttribute("href", "/app/projects/project-1/review");
  });

  it("成功但没有诊断结果时显示无有效源码状态而不是零分", async () => {
    reviewApi.getCodeReview.mockResolvedValue({ ...review, score: null, result: null });

    render(<CodeReviewDetailClient codeReviewId="review-empty" projectId="project-1" />);

    expect(await screen.findByText("未识别到可审查的源代码")).toBeInTheDocument();
    expect(screen.queryByText("0/100")).not.toBeInTheDocument();
  });
});
