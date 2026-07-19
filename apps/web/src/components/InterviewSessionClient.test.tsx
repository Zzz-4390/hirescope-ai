import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInterview, saveInterviewAnswer, submitInterview } from "../lib/interviews";
import { findInterviewProject } from "../lib/project-collections";
import { InterviewSessionClient } from "./InterviewSessionClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/interviews", () => ({
  INTERVIEW_ANSWER_MAX_LENGTH: 5000,
  getInterview: vi.fn(),
  saveInterviewAnswer: vi.fn(),
  startInterview: vi.fn(),
  submitInterview: vi.fn(),
}));
vi.mock("../lib/project-collections", () => ({ findInterviewProject: vi.fn() }));
vi.mock("../lib/projects", () => ({ getTask: vi.fn(), isTerminalTaskStatus: vi.fn() }));

describe("InterviewSessionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findInterviewProject).mockResolvedValue(project());
    vi.mocked(saveInterviewAnswer).mockImplementation(async (_interviewId, questionId, input) => ({
      id: `answer-${questionId}`, questionId, content: input.content, answeredAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z", currentIndex: 1,
    }));
  });

  it("saves the current draft immediately before moving to another question", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail([null, null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    const answer = await screen.findByLabelText("你的回答");
    await user.type(answer, "Redis 用于异步任务状态管理");
    await user.click(screen.getByRole("button", { name: "下一题" }));

    await waitFor(() => expect(saveInterviewAnswer).toHaveBeenCalledWith("interview-1", questionId(1), { content: "Redis 用于异步任务状态管理" }));
    expect(screen.getByText("第 2 / 2 题")).toBeInTheDocument();
    expect(screen.getByText(/已保存/)).toBeInTheDocument();
  });

  it("overwrites an existing answer using the question UUID", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail(["旧答案", null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    await user.click(await screen.findByRole("button", { name: "第 1 题，已完成" }));
    const answer = screen.getByLabelText("你的回答");
    await user.clear(answer);
    await user.type(answer, "覆盖后的答案");
    await user.click(screen.getByRole("button", { name: "下一题" }));

    await waitFor(() => expect(saveInterviewAnswer).toHaveBeenCalledWith(
      "interview-1",
      questionId(1),
      { content: "覆盖后的答案" },
    ));
  });

  it("does not send an empty answer during autosave or question navigation", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail([null, null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    await user.type(await screen.findByLabelText("你的回答"), "   ");
    await user.click(screen.getByRole("button", { name: "下一题" }));

    expect(saveInterviewAnswer).not.toHaveBeenCalled();
    expect(screen.getByText("第 2 / 2 题")).toBeInTheDocument();
  });

  it("blocks submission when an answer is incomplete", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail(["已回答", null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    await user.click(await screen.findByRole("button", { name: "检查并提交" }));

    expect(await screen.findByText("请先完成第 2 题后再提交。")).toBeInTheDocument();
    expect(submitInterview).not.toHaveBeenCalled();
  });

  it("renders real project context, localized legacy category and live character count", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail([null, null], "backend"));
    render(<InterviewSessionClient interviewId="interview-1" />);

    expect(await screen.findByRole("heading", { name: "模拟面试" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "电商平台重构项目" })).toHaveAttribute("href", "/app/projects/project-1");
    expect(screen.getByText("后端开发")).toBeInTheDocument();
    const answer = screen.getByLabelText("你的回答");
    await user.type(answer, "中 A😀");
    expect(screen.getByText("4 字")).toBeInTheDocument();
  });

  it("retries a failed save through the existing answer endpoint", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail([null, null]));
    vi.mocked(saveInterviewAnswer).mockRejectedValueOnce(new Error("网络错误"));
    render(<InterviewSessionClient interviewId="interview-1" />);

    await user.type(await screen.findByLabelText("你的回答"), "需要保存的回答");
    await user.click(screen.getByRole("button", { name: "下一题" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("网络错误");
    await user.click(await screen.findByRole("button", { name: "保存失败，点击重试" }));

    await waitFor(() => expect(saveInterviewAnswer).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/已保存/)).toBeInTheDocument();
  });
});

function detail(answerContents: Array<string | null>, category = "架构") {
  return {
    id: "interview-1", title: "MEDIUM 模拟面试", status: "IN_PROGRESS" as const, difficulty: "MEDIUM" as const,
    questionCount: 2, currentIndex: answerContents[0] ? 1 : 0, failure: null, startedAt: "2026-07-10T00:00:00.000Z",
    submittedAt: null, completedAt: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
    answeredCount: answerContents.filter(Boolean).length,
    answerProgress: { answeredCount: answerContents.filter(Boolean).length, questionCount: 2, percentage: 50 },
    questions: answerContents.map((content, index) => ({
      id: questionId(index + 1), sequence: index + 1, category, difficulty: "MEDIUM" as const, question: `问题 ${index + 1}`,
      answer: content ? { content, answeredAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" } : null,
    })),
    task: null,
  };
}

function questionId(sequence: number): string {
  return `${String(sequence).padStart(8, "0")}-1111-4111-8111-111111111111`;
}

function project() {
  return {
    id: "project-1", name: "电商平台重构项目", originalFileName: "project.zip", fileSize: 100,
    status: "COMPLETED" as const, failure: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
  };
}
