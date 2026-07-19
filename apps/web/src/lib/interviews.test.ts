import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInterview,
  createInterviewReport,
  getInterview,
  getInterviewReport,
  listInterviews,
  saveInterviewAnswer,
  startInterview,
  submitInterview,
} from "./interviews";

describe("interviews api", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ["create", () => createInterview("project-1", { questionCount: 5, difficulty: "MEDIUM" }), "/api/v1/projects/project-1/interviews", "POST", { questionCount: 5, difficulty: "MEDIUM" }],
    ["start", () => startInterview("interview-1"), "/api/v1/interviews/interview-1/start", "POST", undefined],
    ["submit", () => submitInterview("interview-1"), "/api/v1/interviews/interview-1/submit", "POST", undefined],
    ["create report", () => createInterviewReport("interview-1"), "/api/v1/interviews/interview-1/report", "POST", undefined],
  ])("calls the %s mutation route", async (_name, request, path, method, body) => {
    const fetchMock = mockJson({ id: "result-1" });
    await request();
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
      method,
      credentials: "include",
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  });

  it("sends the answer DTO as JSON to the question UUID route", async () => {
    const questionId = "11111111-1111-4111-8111-111111111111";
    const fetchMock = mockJson({ id: "answer-1" });

    await saveInterviewAnswer("interview-1", questionId, { content: "answer" });

    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe(`/api/v1/interviews/interview-1/answers/${questionId}`);
    expect(init).toEqual(expect.objectContaining({
      method: "PUT",
      credentials: "include",
      body: JSON.stringify({ content: "answer" }),
    }));
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("lists interview history with pagination", async () => {
    const fetchMock = mockJson({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    await listInterviews("project-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects/project-1/interviews?page=1&pageSize=20",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it.each([
    ["detail", () => getInterview("interview-1"), "/api/v1/interviews/interview-1"],
    ["report", () => getInterviewReport("interview-1"), "/api/v1/interviews/interview-1/report"],
  ])("calls the %s query route", async (_name, request, path) => {
    const fetchMock = mockJson({ id: "result-1" });
    await request();
    expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({ credentials: "include" }));
  });
});

function mockJson(payload: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}
