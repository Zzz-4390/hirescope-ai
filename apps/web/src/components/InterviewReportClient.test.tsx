import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInterviewReport, getInterview, getInterviewReport } from "../lib/interviews";
import { getTask } from "../lib/projects";
import { InterviewReportClient } from "./InterviewReportClient";

vi.mock("../lib/interviews", () => ({
  createInterviewReport: vi.fn(),
  getInterview: vi.fn(),
  getInterviewReport: vi.fn(),
}));
vi.mock("../lib/projects", () => ({
  getTask: vi.fn(),
  isTerminalTaskStatus: (status: string) => ["SUCCEEDED", "FAILED", "CANCELLED"].includes(status),
}));

describe("InterviewReportClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows an existing report immediately for a completed interview", async () => {
    vi.mocked(getInterview).mockResolvedValue(interview("COMPLETED"));
    vi.mocked(getInterviewReport).mockResolvedValue({ status: "COMPLETED", report: report() });
    render(<InterviewReportClient interviewId="interview-1" />);

    expect(await screen.findByText("综合得分")).toBeInTheDocument();
    expect(screen.getByText("项目理解")).toBeInTheDocument();
    expect(screen.getByText("回答覆盖主要参考要点。")).toBeInTheDocument();
    expect(screen.getByText("已覆盖要点")).toBeInTheDocument();
    expect(screen.getByText("参考改进回答")).toBeInTheDocument();
  });

  it("resumes an existing report task and loads its result", async () => {
    vi.mocked(getInterview)
      .mockResolvedValueOnce(interview("REPORT_GENERATING"))
      .mockResolvedValueOnce(interview("COMPLETED"));
    vi.mocked(createInterviewReport).mockResolvedValue({ interview: { id: "interview-1", status: "REPORT_GENERATING" }, task: { id: "task-1", type: "INTERVIEW_REPORT_GENERATION", status: "QUEUED", failure: null } });
    vi.mocked(getTask).mockResolvedValue({ id: "task-1", type: "INTERVIEW_REPORT_GENERATION", status: "SUCCEEDED", failure: null });
    vi.mocked(getInterviewReport).mockResolvedValue({ status: "COMPLETED", report: report() });
    render(<InterviewReportClient interviewId="interview-1" />);

    expect(await screen.findByText("回答覆盖主要参考要点。")).toBeInTheDocument();
    expect(createInterviewReport).toHaveBeenCalledWith("interview-1");
    expect(getTask).toHaveBeenCalledWith("task-1");
  });
});

function interview(status: "REPORT_GENERATING" | "COMPLETED") {
  return {
    id: "interview-1", title: "模拟面试", status, difficulty: "MEDIUM" as const, questionCount: 1, currentIndex: 1,
    failure: null, startedAt: null, submittedAt: null, completedAt: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z",
    answeredCount: 1, answerProgress: { answeredCount: 1, questionCount: 1, percentage: 100 }, task: null,
  };
}

function report() {
  return {
    id: "report-1", overallScore: 88, summary: "整体表现稳定。",
    dimensions: { projectUnderstanding: 90, technicalAccuracy: 88, communication: 84, problemSolving: 89 },
    questionReviews: [{ questionId: "question-1", sequence: 1, score: 88, comment: "回答覆盖主要参考要点。", summary: "回答覆盖主要参考要点。", coveredPoints: ["JWT"], missedPoints: ["异常处理"], strengths: ["说明了 JWT"], improvements: ["补充异常处理"], improvedAnswerExample: "使用 JWT 并统一处理异常。", matchedReferencePoints: 2, totalReferencePoints: 2 }],
    strengths: ["项目理解清晰"], improvements: ["补充性能数据"], model: "deterministic-interview-report-v1", createdAt: "2026-07-10T00:00:00.000Z",
  };
}
