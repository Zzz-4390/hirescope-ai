import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInterview, saveInterviewAnswer, submitInterview } from "../lib/interviews";
import { InterviewSessionClient } from "./InterviewSessionClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../lib/interviews", () => ({
  getInterview: vi.fn(),
  saveInterviewAnswer: vi.fn(),
  startInterview: vi.fn(),
  submitInterview: vi.fn(),
}));
vi.mock("../lib/projects", () => ({ getTask: vi.fn(), isTerminalTaskStatus: vi.fn() }));

describe("InterviewSessionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveInterviewAnswer).mockImplementation(async (_interviewId, questionId, content) => ({
      id: `answer-${questionId}`, questionId, content, answeredAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z", currentIndex: 1,
    }));
  });

  it("saves the current draft immediately before moving to another question", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail([null, null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    const answer = await screen.findByLabelText("你的回答");
    await user.type(answer, "Redis 用于异步任务状态管理");
    await user.click(screen.getByRole("button", { name: "下一题" }));

    await waitFor(() => expect(saveInterviewAnswer).toHaveBeenCalledWith("interview-1", "question-1", "Redis 用于异步任务状态管理"));
    expect(screen.getByText("第 2 / 2 题")).toBeInTheDocument();
  });

  it("blocks submission when an answer is incomplete", async () => {
    const user = userEvent.setup();
    vi.mocked(getInterview).mockResolvedValue(detail(["已回答", null]));
    render(<InterviewSessionClient interviewId="interview-1" />);

    await user.click(await screen.findByRole("button", { name: "提交面试" }));

    expect(await screen.findByText("请先完成第 2 题后再提交。")).toBeInTheDocument();
    expect(submitInterview).not.toHaveBeenCalled();
  });
});

function detail(answerContents: Array<string | null>) {
  return {
    id: "interview-1", title: "MEDIUM 模拟面试", status: "IN_PROGRESS" as const, difficulty: "MEDIUM" as const,
    questionCount: 2, currentIndex: answerContents[0] ? 1 : 0, failure: null, startedAt: "2026-07-10T00:00:00.000Z",
    submittedAt: null, completedAt: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
    answeredCount: answerContents.filter(Boolean).length,
    answerProgress: { answeredCount: answerContents.filter(Boolean).length, questionCount: 2, percentage: 50 },
    questions: answerContents.map((content, index) => ({
      id: `question-${index + 1}`, sequence: index + 1, category: "架构", difficulty: "MEDIUM" as const, question: `问题 ${index + 1}`,
      answer: content ? { content, answeredAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" } : null,
    })),
    task: null,
  };
}
