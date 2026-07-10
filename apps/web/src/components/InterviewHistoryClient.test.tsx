import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api";
import { createInterview, listInterviews } from "../lib/interviews";
import { getProject } from "../lib/projects";
import { InterviewHistoryClient } from "./InterviewHistoryClient";

vi.mock("../lib/interviews", () => ({
  createInterview: vi.fn(),
  getInterview: vi.fn(),
  listInterviews: vi.fn(),
}));
vi.mock("../lib/projects", () => ({
  getProject: vi.fn(),
  getTask: vi.fn(),
  isTerminalTaskStatus: vi.fn(),
}));

const emptyHistory = { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

describe("InterviewHistoryClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProject).mockResolvedValue({ id: "project-1", name: "Demo", status: "COMPLETED" } as never);
    vi.mocked(listInterviews).mockResolvedValue(emptyHistory);
  });

  it("recovers interview history when creation returns a duplicate-task conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(createInterview).mockRejectedValue(new ApiError("active", 409, "TASK_ALREADY_ACTIVE"));
    render(<InterviewHistoryClient projectId="project-1" />);

    await user.click(await screen.findByRole("button", { name: "创建面试" }));

    expect(await screen.findByText("已有面试题生成任务正在运行，已恢复当前任务。")).toBeInTheDocument();
    await waitFor(() => expect(listInterviews).toHaveBeenCalledTimes(2));
  });

  it("disables creation until project analysis is complete", async () => {
    vi.mocked(getProject).mockResolvedValue({ id: "project-1", name: "Demo", status: "ANALYZING" } as never);
    render(<InterviewHistoryClient projectId="project-1" />);

    expect(await screen.findByRole("button", { name: "创建面试" })).toBeDisabled();
    expect(screen.getByText(/项目分析完成后才能创建面试/)).toBeInTheDocument();
  });
});
